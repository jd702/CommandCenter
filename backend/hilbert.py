import numpy as np
from typing import Tuple, Dict
import time

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
    
    def __init__(self, hilbert_order: int = 3):
        self.hilbert = Hilbert3D(hilbert_order)
        self.max_coord = self.hilbert.size - 1
    
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
            'compressed_distances': compressed_distances.tolist(),
            'compressed_colors': compressed_colors.tolist(),
            'first_color': sorted_colors[0].tolist(),
            'sorted_indices': sorted_indices.tolist(),
            'norm_params': norm_params,
        }
    def decompress_point_cloud(self, compressed_data: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """Decompress point cloud from Hilbert representation"""
        compressed_distances = np.array(compressed_data['compressed_distances'])
        compressed_colors = np.array(compressed_data['compressed_colors'])
        first_color = np.array(compressed_data['first_color'])
        sorted_indices = np.array(compressed_data['sorted_indices'])
        
        # Reconstruct Hilbert distances
        hilbert_distances = np.cumsum(np.concatenate([[0], compressed_distances]))
        
        # Reconstruct colors
        reconstructed_colors = np.cumsum(compressed_colors, axis=0) + first_color
        
        # Convert Hilbert distances back to coordinates
        reconstructed_points = []
        for distance in hilbert_distances:
            x, y, z = self.hilbert.distance_to_point(int(distance))
            reconstructed_points.append([x, y, z])
        
        reconstructed_points = np.array(reconstructed_points)
        
        # Unsort the points and colors
        unsorted_points = np.zeros_like(reconstructed_points)
        unsorted_colors = np.zeros_like(reconstructed_colors)
        unsorted_points[sorted_indices] = reconstructed_points
        unsorted_colors[sorted_indices] = reconstructed_colors
        
        return unsorted_points, unsorted_colors.astype(np.uint8)

# Global variables for storing compression results
compression_results = {}
compressor = PointCloudCompressor(hilbert_order=3)