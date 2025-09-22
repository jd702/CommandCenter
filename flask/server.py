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
    
    def __init__(self, hilbert_order: int = 8):
        self.hilbert = Hilbert3D(hilbert_order)
        self.max_coord = self.hilbert.size - 1
        
    def generate_point_cloud(self, num_points: int = 10000, 
                           cloud_type: str = "sphere") -> np.ndarray:
        """Generate synthetic 3D point cloud data"""
        
        if cloud_type == "sphere":
            # Generate points on a sphere
            phi = np.random.uniform(0, 2*np.pi, num_points)
            costheta = np.random.uniform(-1, 1, num_points)
            theta = np.arccos(costheta)
            
            r = np.random.uniform(0.7, 1.0, num_points)  # Hollow sphere
            
            x = r * np.sin(theta) * np.cos(phi)
            y = r * np.sin(theta) * np.sin(phi)
            z = r * np.cos(theta)
            
        elif cloud_type == "cube":
            # Generate random points in a cube
            x = np.random.uniform(-1, 1, num_points)
            y = np.random.uniform(-1, 1, num_points) 
            z = np.random.uniform(-1, 1, num_points)
            
        elif cloud_type == "torus":
            # Generate points on a torus
            u = np.random.uniform(0, 2*np.pi, num_points)
            v = np.random.uniform(0, 2*np.pi, num_points)
            R = 1.0  # Major radius
            r = 0.3  # Minor radius
            
            x = (R + r * np.cos(v)) * np.cos(u)
            y = (R + r * np.cos(v)) * np.sin(u)
            z = r * np.sin(v)
            
        else:
            # Default: random cloud
            x = np.random.normal(0, 1, num_points)
            y = np.random.normal(0, 1, num_points)
            z = np.random.normal(0, 1, num_points)
        
        points = np.column_stack([x, y, z])
        return points
    
    def normalize_points(self, points: np.ndarray) -> np.ndarray:
        """Normalize points to fit in Hilbert cube [0, max_coord]"""
        # Normalize to [0, 1]
        min_vals = points.min(axis=0)
        max_vals = points.max(axis=0)
        normalized = (points - min_vals) / (max_vals - min_vals)
        
        # Scale to Hilbert space
        scaled = normalized * self.max_coord
        return scaled.astype(int)
    
    def compress_point_cloud(self, points: np.ndarray) -> Dict:
        """Compress point cloud using Hilbert space-filling curve"""
        start_time = time.time()
        
        # Normalize points to fit in Hilbert space
        normalized_points = self.normalize_points(points)
        
        # Calculate Hilbert distances
        hilbert_distances = []
        for point in normalized_points:
            x, y, z = point
            distance = self.hilbert.hilbert_distance(x, y, z)
            hilbert_distances.append(distance)
        
        # Sort by Hilbert distance for better compression
        sorted_indices = np.argsort(hilbert_distances)
        sorted_distances = np.array(hilbert_distances)[sorted_indices]
        
        # Calculate compression metrics
        original_size = points.nbytes
        
        # Compress by storing differences between consecutive Hilbert distances
        compressed_distances = np.diff(np.concatenate([[0], sorted_distances]))
        compressed_size = compressed_distances.nbytes + sorted_indices.nbytes
        
        compression_ratio = original_size / compressed_size
        processing_time = time.time() - start_time
        
        return {
            'original_points': points.tolist(),
            'normalized_points': normalized_points.tolist(),
            'hilbert_distances': sorted_distances.tolist(),
            'compressed_distances': compressed_distances.tolist(),
            'sorted_indices': sorted_indices.tolist(),
        }
    
    def decompress_point_cloud(self, compressed_data: Dict) -> np.ndarray:
        """Decompress point cloud from Hilbert representation"""
        compressed_distances = np.array(compressed_data['compressed_distances'])
        sorted_indices = np.array(compressed_data['sorted_indices'])
        
        # Reconstruct Hilbert distances
        hilbert_distances = np.cumsum(np.concatenate([[0], compressed_distances]))
        
        # Convert Hilbert distances back to coordinates
        reconstructed_points = []
        for distance in hilbert_distances:
            x, y, z = self.hilbert.distance_to_point(int(distance))
            reconstructed_points.append([x, y, z])
        
        reconstructed_points = np.array(reconstructed_points)
        
        # Unsort the points
        unsorted_points = np.zeros_like(reconstructed_points)
        unsorted_points[sorted_indices] = reconstructed_points
        
        return unsorted_points

# Global variables for storing compression results
compression_results = {}
compressor = PointCloudCompressor(hilbert_order=6)

@app.route('/')
def home():
    """Home endpoint with API documentation"""
    return jsonify({
        'message': 'Hilbert Space-Filling Curve Point Cloud Compressor',
        'endpoints': {
            '/generate': 'POST - Generate and compress point cloud',
            '/status/<job_id>': 'GET - Check compression job status',
            '/decompress/<job_id>': 'GET - Decompress point cloud',
            '/stats': 'GET - Get compression statistics'
        },
        'example_request': {
            'url': '/generate',
            'method': 'POST',
            'body': {
                'num_points': 5000,
                'cloud_type': 'sphere'
            }
        }
    })

@app.route('/generate', methods=['GET','POST'])
def generate():
    """Generate point cloud and compress using Hilbert curve"""
    try:
        print("Here")
        data = request.get_json() or {}
        num_points = data.get('num_points', 5000)
        cloud_type = data.get('cloud_type', 'sphere')
        
        # Validate inputs
        if num_points > 50000:
            return jsonify({'error': 'Maximum 50000 points allowed'}), 400
        
        if cloud_type not in ['sphere', 'cube', 'torus', 'random']:
            return jsonify({'error': 'Invalid cloud_type. Use: sphere, cube, torus, random'}), 400
        
        # Generate job ID
        job_id = f"job_{int(time.time() * 1000)}"
        points = compressor.generate_point_cloud(num_points, cloud_type)
        result = compressor.compress_point_cloud(points)
        return jsonify({
        "compressed_data": {
            "compressed_distances": result['compressed_distances'],
            "sorted_indices": result['sorted_indices'],
            "hilbert_order": 6,
            "max_coord": 63
        }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/generate_compress', methods=['POST'])
def generate_and_compress():
    """Generate point cloud and compress using Hilbert curve"""
    try:
        data = request.get_json() or {}
        num_points = data.get('num_points', 5000)
        cloud_type = data.get('cloud_type', 'sphere')
        
        # Validate inputs
        if num_points > 50000:
            return jsonify({'error': 'Maximum 50000 points allowed'}), 400
        
        if cloud_type not in ['sphere', 'cube', 'torus', 'random']:
            return jsonify({'error': 'Invalid cloud_type. Use: sphere, cube, torus, random'}), 400
        
        # Generate job ID
        job_id = f"job_{int(time.time() * 1000)}"
        
        # Start compression in background thread
        def compress_async():
            try:
                # Generate point cloud
                points = compressor.generate_point_cloud(num_points, cloud_type)
                
                # Compress using Hilbert curve
                result = compressor.compress_point_cloud(points)
                result['job_id'] = job_id
                result['status'] = 'completed'
                result['cloud_type'] = cloud_type
                
                compression_results[job_id] = result
                
            except Exception as e:
                compression_results[job_id] = {
                    'job_id': job_id,
                    'status': 'failed',
                    'error': str(e)
                }
        
        # Mark job as started
        compression_results[job_id] = {
            'job_id': job_id,
            'status': 'processing',
            'cloud_type': cloud_type,
            'num_points': num_points
        }
        
        # Start background thread
        thread = threading.Thread(target=compress_async)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'job_id': job_id,
            'status': 'started',
            'message': 'Point cloud generation and compression started',
            'check_status_url': f'/status/{job_id}'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status/<job_id>', methods=['GET'])
def get_status(job_id):
    """Get compression job status and results"""
    if job_id not in compression_results:
        return jsonify({'error': 'Job not found'}), 404
    
    result = compression_results[job_id]
    
    if result['status'] == 'completed':
        # Return summary without full point data
        summary = {
            'job_id': job_id,
            'status': result['status'],
            'cloud_type': result['cloud_type'],
            'compression_stats': result['compression_stats'],
            'sample_points': result['original_points'][:10],  # First 10 points
            'hilbert_distances_sample': result['hilbert_distances'][:10]
        }
        return jsonify(summary)
    
    return jsonify(result)

@app.route('/decompress/<job_id>', methods=['GET'])
def decompress_cloud(job_id):
    """Decompress point cloud from Hilbert representation"""
    if job_id not in compression_results:
        return jsonify({'error': 'Job not found'}), 404
    
    result = compression_results[job_id]
    
    if result['status'] != 'completed':
        return jsonify({'error': 'Job not completed yet'}), 400
    
    try:
        # Decompress the point cloud
        decompressed_points = compressor.decompress_point_cloud(result)
        
        return jsonify({
            'job_id': job_id,
            'decompressed_points': decompressed_points.tolist(),
            'num_points': len(decompressed_points),
            'compression_stats': result['compression_stats']
        })
        
    except Exception as e:
        return jsonify({'error': f'Decompression failed: {str(e)}'}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    """Get overall compression statistics"""
    completed_jobs = [job for job in compression_results.values() 
                     if job.get('status') == 'completed']
    
    if not completed_jobs:
        return jsonify({'message': 'No completed jobs yet'})
    
    # Calculate average statistics
    total_ratios = [job['compression_stats']['compression_ratio'] 
                   for job in completed_jobs]
    total_times = [job['compression_stats']['processing_time_seconds'] 
                  for job in completed_jobs]
    
    stats = {
        'total_jobs': len(compression_results),
        'completed_jobs': len(completed_jobs),
        'average_compression_ratio': np.mean(total_ratios),
        'average_processing_time': np.mean(total_times),
        'best_compression_ratio': max(total_ratios),
        'jobs': [{'job_id': job['job_id'], 
                 'cloud_type': job['cloud_type'],
                 'compression_ratio': job['compression_stats']['compression_ratio']}
                for job in completed_jobs[-10:]]  # Last 10 jobs
    }
    
    return jsonify(stats)

@app.route('/clear', methods=['POST'])
def clear_results():
    """Clear all compression results"""
    global compression_results
    compression_results = {}
    return jsonify({'message': 'All results cleared'})

if __name__ == '__main__':
    print("Starting Hilbert Space-Filling Curve Point Cloud Compressor")
    print("Access the API at: http://localhost:5000")
    print("\nExample usage:")
    print("curl -X POST http://localhost:5000/generate -H 'Content-Type: application/json' -d '{\"num_points\": 1000, \"cloud_type\": \"sphere\"}'")
    
    app.run(debug=True, host='0.0.0.0', port=9000)