import { useState } from "react";

class Hilbert3D {
  constructor(order = 3) {
    this.order = order;
    this.size = Math.pow(2, order);
  }

  // Calculate Hilbert distance for 3D coordinates
  hilbertDistance(x, y, z) {
    let n = this.size;
    let d = 0;
    
    // Convert coordinates to binary and process bit by bit
    for (let s = this.order - 1; s >= 0; s--) {
      const rx = (x >> s) & 1;
      const ry = (y >> s) & 1;
      const rz = (z >> s) & 1;
      
      d += (rx ^ ry ^ rz) * Math.pow(n, 3) / 4;
      
      // Rotate coordinates
      [x, y, z] = this._rotate(n, x, y, z, rx, ry, rz);
      n = Math.floor(n / 2);
    }
    
    return Math.floor(d);
  }

  // Rotate coordinates for Hilbert curve
  _rotate(n, x, y, z, rx, ry, rz) {
    if (rz === 0) {
      if (ry === 0) {
        [x, y] = [y, x];
      }
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
    }
    return [x, y, z];
  }

  // Convert Hilbert distance back to 3D coordinates
  distanceToPoint(distance) {
    let n = this.size;
    let t = distance;
    let x = 0, y = 0, z = 0;
    
    for (let s = 0; s < this.order; s++) {
      const rx = 1 & (t >> 2);
      const ry = 1 & (t >> 1);
      const rz = 1 & t;
      
      [x, y, z] = this._unrotate(n, x, y, z, rx, ry, rz);
      x += rx * n;
      y += ry * n;
      z += rz * n;
      
      t >>= 3;
      n >>= 1;
    }
    
    return [x, y, z];
  }

  // Inverse rotation for Hilbert curve
  _unrotate(n, x, y, z, rx, ry, rz) {
    if (rz === 0) {
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
      if (ry === 0) {
        [x, y] = [y, x];
      }
    }
    return [x, y, z];
  }
}

// Point Cloud Decompressor class for React
export class PointCloudDecompressor {
  constructor(hilbertOrder = 3) {
    this.hilbert = new Hilbert3D(hilbertOrder);
    this.maxCoord = this.hilbert.size - 1;
    // Store normalization parameters - these need to come from the server
    this.normalizationParams = null;
  }

  // Set normalization parameters from the server
  setNormalizationParams(minVals, maxVals) {
    this.normalizationParams = { minVals, maxVals };
    console.log('Set normalization params:', this.normalizationParams);
  }

  // Denormalize points back to original coordinate space
  denormalizePoints(normalizedPoints) {
    if (!this.normalizationParams) {
      console.warn('No normalization parameters available, using default range [-1, 1]');
      // Fallback: assume original range was [-1, 1] for each axis
      return normalizedPoints.map(point => [
        (point[0] / this.maxCoord) * 2 - 1,
        (point[1] / this.maxCoord) * 2 - 1,
        (point[2] / this.maxCoord) * 2 - 1
      ]);
    }

    const { minVals, maxVals } = this.normalizationParams;
    
    return normalizedPoints.map(point => {
      // Convert from [0, maxCoord] back to [0, 1]
      const normalized = [
        point[0] / this.maxCoord,
        point[1] / this.maxCoord,
        point[2] / this.maxCoord
      ];
      
      // Convert from [0, 1] back to original range
      return [
        normalized[0] * (maxVals[0] - minVals[0]) + minVals[0],
        normalized[1] * (maxVals[1] - minVals[1]) + minVals[1],
        normalized[2] * (maxVals[2] - minVals[2]) + minVals[2]
      ];
    });
  }

  // Decompress point cloud from Hilbert representation
  decompressPointCloud(compressedData) {
    try {
      const { 
        compressed_colors, 
        compressed_distances, 
        first_color,
        hilbert_order, 
        max_coord,
        norm_params,
        sorted_indices
        // New: normalization parameters (if available)
        
      } = compressedData;
      
      // Validate input data
      if (!compressed_distances || !Array.isArray(compressed_distances)) {
        throw new Error('Invalid compressed_distances data');
      }
      if (!compressed_colors || !Array.isArray(compressed_colors)) {
        throw new Error('Invalid compressed_colors data');
      }
      if (!sorted_indices || !Array.isArray(sorted_indices)) {
        throw new Error('Invalid sorted_indices data');
      }
      if (!first_color || !Array.isArray(first_color)) {
        throw new Error('Invalid first_color data');
      }
      
      console.log(`Starting decompression: ${sorted_indices.length} expected points`);
      
      if (hilbert_order && hilbert_order !== this.hilbert.order) {
        this.hilbert = new Hilbert3D(hilbert_order);
        this.maxCoord = max_coord || this.hilbert.size - 1;
      }

      // Set normalization parameters if provided
      if (norm_params) {
        this.setNormalizationParams(norm_params.min_vals, norm_params.max_vals);
      }
      
      // Reconstruct Hilbert distances
      const hilbertDistances = [0]; // Start with 0
      let cumSum = 0;
      
      for (let i = 0; i < compressed_distances.length; i++) {
        const delta = compressed_distances[i];
        if (typeof delta !== 'number' || isNaN(delta)) {
          console.warn(`Invalid distance delta at index ${i}: ${delta}`);
          continue;
        }
        cumSum += delta;
        hilbertDistances.push(cumSum);
      }
      console.log(`Reconstructed ${hilbertDistances.length} Hilbert distances`);
      
      // Reconstruct colors starting from first_color
      const reconstructedColors = [first_color.slice()]; 
      let colorAccum = first_color.slice();
      
      for (let i = 0; i < compressed_colors.length; i++) {
        const colorDelta = compressed_colors[i];
        if (!Array.isArray(colorDelta) || colorDelta.length !== 3) {
          console.warn(`Invalid color delta at index ${i}:`, colorDelta);
          continue;
        }
        
        // Add delta to accumulated color
        colorAccum = [
          colorAccum[0] + colorDelta[0],
          colorAccum[1] + colorDelta[1],
          colorAccum[2] + colorDelta[2]
        ];
        
        // Clamp color values to 0-255 range
        colorAccum = colorAccum.map(c => Math.max(0, Math.min(255, Math.round(c))));
        reconstructedColors.push(colorAccum.slice());
      }
      console.log(`Reconstructed ${reconstructedColors.length} colors`);
      
      // Convert distances to normalized Hilbert coordinates
      const reconstructedNormalizedPoints = [];
      for (let distance of hilbertDistances) {
        if (distance < 0) distance = 0;
        const [x, y, z] = this.hilbert.distanceToPoint(Math.floor(distance));
        
        // Validate coordinates
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          console.warn(`Invalid coordinates from distance ${distance}: [${x}, ${y}, ${z}]`);
          continue;
        }
        
        reconstructedNormalizedPoints.push([x, y, z]);
      }
      console.log(`Reconstructed ${reconstructedNormalizedPoints.length} normalized points`);
      
      // *** KEY FIX: Denormalize points back to original coordinate space ***
      const reconstructedPoints = this.denormalizePoints(reconstructedNormalizedPoints);
      console.log(`Denormalized ${reconstructedPoints.length} points to original space`);
      
      // Ensure all arrays have consistent length
      const expectedLength = sorted_indices.length;
      const minLength = Math.min(reconstructedPoints.length, reconstructedColors.length);
      
      if (minLength < expectedLength) {
        console.warn(`Length mismatch: expected ${expectedLength}, got ${minLength} points/colors`);
      }
      
      // Create arrays for unsorting
      const unsortedPoints = new Array(expectedLength);
      const unsortedColors = new Array(expectedLength);
      
      // Unsort the points and colors using correct index mapping
      for (let i = 0; i < Math.min(minLength, expectedLength); i++) {
        const originalIndex = sorted_indices[i];
        
        if (typeof originalIndex === 'number' && originalIndex >= 0 && originalIndex < expectedLength) {
          if (i < reconstructedPoints.length) {
            unsortedPoints[originalIndex] = reconstructedPoints[i];
          }
          if (i < reconstructedColors.length) {
            unsortedColors[originalIndex] = reconstructedColors[i];
          }
        }
      }
      
      console.log(`Unsorted arrays created with ${expectedLength} slots`);
      
      // Create final point objects
      const validPoints = [];
      for (let i = 0; i < expectedLength; i++) {
        const point = unsortedPoints[i];
        const color = unsortedColors[i];
        
        if (point && Array.isArray(point) && point.length === 3 &&
            color && Array.isArray(color) && color.length === 3) {
          
          // Validate coordinates - now they should be in original range
          if (point.some(coord => isNaN(coord) || !isFinite(coord))) {
            console.warn(`Invalid coordinates at index ${i}:`, point);
            continue;
          }
          
          // Create point object in the format expected by the viewer
          validPoints.push({
            x: point[0],  // Already in correct coordinate space
            y: point[1],
            z: point[2],
            r: Math.round(Math.max(0, Math.min(255, color[0]))),
            g: Math.round(Math.max(0, Math.min(255, color[1]))),
            b: Math.round(Math.max(0, Math.min(255, color[2])))
          });
        } else if (i < 10) {
          console.warn(`Missing or invalid point/color at index ${i}:`, { point, color });
        }
      }
      
      console.log(`Final result: ${validPoints.length} valid points out of ${expectedLength} expected`);
      
      // Check recovery rate
      if (validPoints.length < expectedLength * 0.95) {
        console.error(`Significant point loss: ${validPoints.length}/${expectedLength} points recovered (${((validPoints.length/expectedLength)*100).toFixed(1)}%)`);
      } else {
        console.log(`Good recovery rate: ${validPoints.length}/${expectedLength} points (${((validPoints.length/expectedLength)*100).toFixed(1)}%)`);
      }
      
      // Log coordinate range for debugging
      if (validPoints.length > 0) {
        const xRange = [Math.min(...validPoints.map(p => p.x)), Math.max(...validPoints.map(p => p.x))];
        const yRange = [Math.min(...validPoints.map(p => p.y)), Math.max(...validPoints.map(p => p.y))];
        const zRange = [Math.min(...validPoints.map(p => p.z)), Math.max(...validPoints.map(p => p.z))];
        console.log(`Decompressed coordinate ranges: X[${xRange[0].toFixed(3)}, ${xRange[1].toFixed(3)}], Y[${yRange[0].toFixed(3)}, ${yRange[1].toFixed(3)}], Z[${zRange[0].toFixed(3)}, ${zRange[1].toFixed(3)}]`);
      }
      
      return validPoints;
      
    } catch (error) {
      console.error('Decompression error:', error);
      throw error;
    }
  }
}

// React hook for point cloud decompression
export const usePointCloudDecompressor = () => {
  const [decompressor] = useState(() => new PointCloudDecompressor(4)); // Match server order
  
  const decompressPoints = (compressedData) => {
    try {
      return decompressor.decompressPointCloud(compressedData);
    } catch (error) {
      console.error('Decompression failed:', error);
      return null;
    }
  };
  
  return { decompressPoints };
};