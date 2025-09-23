from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import json
from typing import List, Tuple, Dict
import time
import threading

app = Flask(__name__)
CORS(app)

class Hilbert3D:
    """3D Hilbert curve implementation for point cloud compression"""
    
    def __init__(self, order: int = 3):
        self.order = order
        self.size = 2 ** order
        
    def hilbert_distance(self, x: int, y: int, z: int) -> int:
        """Calculate Hilbert distance for 3D coordinates"""
        n = self.size
        d = 0
        
        # Convert coordinates to binary and process bit by bit
        for s in range(self.order - 1, -1, -1):
            rx = (x >> s) & 1
            ry = (y >> s) & 1
            rz = (z >> s) & 1
            
            d += (rx ^ ry ^ rz) * (n ** 3) // 4
            
            # Rotate coordinates
            x, y, z = self._rotate(n, x, y, z, rx, ry, rz)
            n //= 2
            
        return d
    
    def _rotate(self, n: int, x: int, y: int, z: int, rx: int, ry: int, rz: int) -> Tuple[int, int, int]:
        """Rotate coordinates for Hilbert curve"""
        if rz == 0:
            if ry == 0:
                x, y = y, x
            if rx == 1:
                x = n - 1 - x
                y = n - 1 - y
        return x, y, z
    
    def distance_to_point(self, distance: int) -> Tuple[int, int, int]:
        """Convert Hilbert distance back to 3D coordinates"""
        n = self.size
        t = distance
        x = y = z = 0
        
        for s in range(self.order):
            rx = 1 & (t >> 2)
            ry = 1 & (t >> 1)
            rz = 1 & t
            
            x, y, z = self._unrotate(n, x, y, z, rx, ry, rz)
            x += rx * n
            y += ry * n
            z += rz * n
            
            t >>= 3
            n >>= 1
            
        return x, y, z
    
    def _unrotate(self, n: int, x: int, y: int, z: int, rx: int, ry: int, rz: int) -> Tuple[int, int, int]:
        """Inverse rotation for Hilbert curve"""
        if rz == 0:
            if rx == 1:
                x = n - 1 - x
                y = n - 1 - y
            if ry == 0:
                x, y = y, x
        return x, y, z

class PointCloudCompressor:
    """Point cloud compression using Hilbert space-filling curve"""
    
    def __init__(self, hilbert_order: int = 4):
        self.hilbert = Hilbert3D(hilbert_order)
        self.max_coord = self.hilbert.size - 1
        print(f"Initialized compressor with order {hilbert_order}, max_coord {self.max_coord}")
        
    def generate_point_cloud_with_colors(self, num_points: int = 10000, 
                                       cloud_type: str = "sphere") -> Tuple[np.ndarray, np.ndarray]:
        """Generate synthetic 3D point cloud data with colors"""
        
        if cloud_type == "sphere":
            # Generate points on a sphere
            phi = np.random.uniform(0, 2*np.pi, num_points)
            costheta = np.random.uniform(-1, 1, num_points)
            theta = np.arccos(costheta)
            
            r = np.random.uniform(0.7, 1.0, num_points)  # Hollow sphere
            
            x = r * np.sin(theta) * np.cos(phi)
            y = r * np.sin(theta) * np.sin(phi)
            z = r * np.cos(theta)
            
            # Sphere colors - blue to cyan gradient based on height
            colors = np.zeros((num_points, 3))
            height_normalized = (z + 1) / 2  # Normalize z from [-1,1] to [0,1]
            colors[:, 0] = 50 + height_normalized * 100   # R: 50-150
            colors[:, 1] = 150 + height_normalized * 105  # G: 150-255
            colors[:, 2] = 200 + height_normalized * 55   # B: 200-255
            
        elif cloud_type == "cube":
            # Generate random points in a cube
            x = np.random.uniform(-1, 1, num_points)
            y = np.random.uniform(-1, 1, num_points) 
            z = np.random.uniform(-1, 1, num_points)
            
            # Cube colors - red gradient
            colors = np.zeros((num_points, 3))
            pos_normalized = (x + y + z + 3) / 6  # Normalize combined position
            colors[:, 0] = 100 + pos_normalized * 155  # R: 100-255
            colors[:, 1] = 50 + pos_normalized * 100   # G: 50-150
            colors[:, 2] = 50 + pos_normalized * 100   # B: 50-150
            
        else:
            # Default: random cloud with your specified colors
            x = np.random.normal(0, 1, num_points)
            y = np.random.normal(0, 1, num_points)
            z = np.random.normal(0, 1, num_points)
            
            # Use your specified colors: r=100, g=100, b=100
            colors = np.full((num_points, 3), [100, 100, 100])
        
        points = np.column_stack([x, y, z])
        colors = colors.astype(np.uint8)
        return points, colors
    
    def normalize_points(self, points: np.ndarray) -> Tuple[np.ndarray, Dict]:
        """Normalize points to fit in Hilbert cube [0, max_coord] and return normalization params"""
        # Calculate normalization parameters
        min_vals = points.min(axis=0)
        max_vals = points.max(axis=0)
        
        # Normalize to [0, 1]
        normalized = (points - min_vals) / (max_vals - min_vals)
        
        # Scale to Hilbert space
        scaled = normalized * self.max_coord
        
        # Store normalization parameters for later denormalization
        norm_params = {
            'min_vals': min_vals.tolist(),
            'max_vals': max_vals.tolist(),
            'max_coord': self.max_coord
        }
        
        return scaled.astype(int), norm_params
    
    def compress_point_cloud(self, points: np.ndarray, colors: np.ndarray) -> Dict:
        """Compress point cloud using Hilbert space-filling curve"""
        start_time = time.time()
        print(f"Compressing {len(points)} points with colors")
        
        # Normalize points to fit in Hilbert space
        normalized_points, norm_params = self.normalize_points(points)
        print(f"Normalized points range: {norm_params.get('min')} to {norm_params.get('max')}")
        
        # Calculate Hilbert distances
        hilbert_distances = []
        for point in normalized_points:
            x, y, z = point
            distance = self.hilbert.hilbert_distance(x, y, z)
            hilbert_distances.append(distance)
        
        print(f"Calculated {len(hilbert_distances)} Hilbert distances")
        
        # Sort by Hilbert distance for better compression
        sorted_indices = np.argsort(hilbert_distances)
        sorted_distances = np.array(hilbert_distances)[sorted_indices]
        
        # Sort colors according to the same indices
        sorted_colors = colors[sorted_indices]
        
        print(f"Sorted by Hilbert distance, range: {sorted_distances.min()} to {sorted_distances.max()}")
        
        # Calculate compression metrics
        original_points_size = points.nbytes
        original_colors_size = colors.nbytes
        original_size = original_points_size + original_colors_size
        
        # Compress by storing differences between consecutive Hilbert distances
        compressed_distances = np.diff(np.concatenate([[0], sorted_distances]))
        
        # Compress colors - store color differences
        compressed_colors = np.diff(sorted_colors, axis=0, prepend=sorted_colors[0:1])
        
        compressed_size = (compressed_distances.nbytes + compressed_colors.nbytes + 
                          sorted_indices.nbytes + sorted_colors[0].nbytes)
        
        compression_ratio = original_size / compressed_size
        processing_time = time.time() - start_time
        
        print(f"Compression complete: {compression_ratio:.2f}x ratio in {processing_time*1000:.1f}ms")
        print(f"Original size: {original_size} bytes, Compressed size: {compressed_size} bytes")
        
        return {
            'original_points': points,  # Keep as numpy arrays for now
            'original_colors': colors,
            'compressed_distances': compressed_distances.tolist(),
            'compressed_colors': compressed_colors.tolist(),
            'first_color': sorted_colors[0].tolist(),
            'sorted_indices': sorted_indices.tolist(),
            'norm_params': norm_params,
            'compression_stats': {
                'original_size_bytes': int(original_size),
                'compressed_size_bytes': int(compressed_size),
                'compression_ratio': float(compression_ratio),
                'processing_time_seconds': float(processing_time),
                'num_points': len(points),
                'hilbert_order': self.hilbert.order,
                'max_coord': self.max_coord
            }
        }

# Global variables
compression_results = {}
hilbert_order = 4
compressor = PointCloudCompressor(hilbert_order=hilbert_order)

@app.route('/')
def home():
    """Home endpoint with API documentation"""
    return jsonify({
        'message': 'Hilbert Space-Filling Curve Point Cloud Compressor',
        'hilbert_order': hilbert_order,
        'max_coord': compressor.max_coord,
        'endpoints': {
            '/generate': 'GET - Generate and compress point cloud',
            '/test_decompress': 'GET - Test full compression/decompression cycle'
        }
    })

@app.route('/generate', methods=['GET', 'POST'])
def generate():
    """Generate point cloud and compress using Hilbert curve"""
    try:
        # Get parameters
        num_points = 8000
        print("heres")
        # Generate point cloud with colors
        points, colors = compressor.generate_point_cloud_with_colors(num_points)
        print("here")
        # Compress the point cloud
        compression_result = compressor.compress_point_cloud(points, colors)
        
        # Create original points with colors in the format your React app expects
        original_points_with_colors = []
        for i in range(len(points)):
            original_points_with_colors.append({
                "x": float(points[i][0]),
                "y": float(points[i][1]),
                "z": float(points[i][2]),
                "r": int(colors[i][0]),
                "g": int(colors[i][1]),
                "b": int(colors[i][2])
            })
        
        response_data = {
            "points": original_points_with_colors,  # Original points for comparison
            "compressed_data": {
                'compressed_colors': compression_result['compressed_colors'],
                'first_color': compression_result['first_color'],
                "compressed_distances": compression_result['compressed_distances'],
                "sorted_indices": compression_result['sorted_indices'],
                "hilbert_order": hilbert_order,
                "max_coord": compressor.max_coord,
                "norm_params": compression_result['norm_params']  # *** KEY ADDITION ***
            },
            "compression_stats": compression_result['compression_stats'],
            "num_points": num_points
        }
        
        print(f"Returning {len(original_points_with_colors)} original points and compressed data")
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error in generate: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/test_decompress', methods=['GET'])
def test_decompress():
    """Test the full compression/decompression cycle"""
    try:
        print("Testing compression/decompression cycle...")
        
        # Generate test data
        points, colors = compressor.generate_point_cloud_with_colors(1000, "sphere")
        print(f"Generated {len(points)} test points")
        
        # Compress
        compression_result = compressor.compress_point_cloud(points, colors)
        
        # Test decompression data format
        compressed_data = {
            'compressed_colors': compression_result['compressed_colors'],
            'first_color': compression_result['first_color'],
            'compressed_distances': compression_result['compressed_distances'],
            'sorted_indices': compression_result['sorted_indices'],
            'hilbert_order': hilbert_order,
            'max_coord': compressor.max_coord
        }
        
        return jsonify({
            'message': 'Test compression completed successfully',
            'original_points_count': len(points),
            'compressed_distances_count': len(compression_result['compressed_distances']),
            'compressed_colors_count': len(compression_result['compressed_colors']),
            'sorted_indices_count': len(compression_result['sorted_indices']),
            'first_color': compression_result['first_color'],
            'compressed_data': compressed_data,
            'stats': compression_result['compression_stats']
        })
        
    except Exception as e:
        print(f"Error in test_decompress: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Hilbert Space-Filling Curve Point Cloud Compressor")
    print(f"Hilbert order: {hilbert_order}, Max coord: {compressor.max_coord}")
    print("Access the API at: http://localhost:9000")
    
    app.run(debug=True, host='0.0.0.0', port=9000)