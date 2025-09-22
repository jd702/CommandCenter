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
class PointCloudDecompressor {
  constructor(hilbertOrder = 8) {
    this.hilbert = new Hilbert3D(hilbertOrder);
    this.maxCoord = this.hilbert.size - 1;
  }

  // Decompress point cloud from Hilbert representation
  decompressPointCloud(compressedData) {
    const { compressed_distances, sorted_indices, hilbert_order, max_coord } = compressedData;
    
    // Update Hilbert parameters if provided
    if (hilbert_order && hilbert_order !== this.hilbert.order) {
      this.hilbert = new Hilbert3D(hilbert_order);
      this.maxCoord = max_coord || this.hilbert.size - 1;
    }
    
    // Reconstruct Hilbert distances from compressed differences
    const hilbertDistances = [];
    let cumSum = 0;
    
    // First distance is always 0
    hilbertDistances.push(0);
    
    // Reconstruct distances using cumulative sum
    for (let i = 0; i < compressed_distances.length; i++) {
      cumSum += compressed_distances[i];
      hilbertDistances.push(cumSum);
    }
    
    // Convert Hilbert distances back to coordinates
    const reconstructedPoints = hilbertDistances.map(distance => {
      const [x, y, z] = this.hilbert.distanceToPoint(distance);
      return [x, y, z];
    });
    
    // Unsort the points using sorted_indices
    const unsortedPoints = new Array(reconstructedPoints.length);
    for (let i = 0; i < sorted_indices.length; i++) {
      if (i < reconstructedPoints.length) {
        unsortedPoints[sorted_indices[i]] = reconstructedPoints[i];
      }
    }
    
    // Normalize back to [-1, 1] range for visualization
    const normalizedPoints = unsortedPoints.map(point => [
      (point[0] / this.maxCoord) * 2 - 1,
      (point[1] / this.maxCoord) * 2 - 1,
      (point[2] / this.maxCoord) * 2 - 1
    ]);
    
    return normalizedPoints;
  }
}
// React hook for point cloud decompression
export const usePointCloudDecompressor = () => {
  const [decompressor] = useState(() => new PointCloudDecompressor(6));
  
  const decompressPoints = (compressedData) => {
    console.log("Compressed data", compressedData)
    try {
      return decompressor.decompressPointCloud(compressedData);
    } catch (error) {
      console.error('Decompression failed:', error);
      return null;
    }
  };
  
  return { decompressPoints };
};
