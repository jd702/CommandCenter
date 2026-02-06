// ros2agents_with_hsdc.js
// Drop-in replacement that supports BOTH:
// 1) New packed Hilbert payload from /pointcloud_compressed
//    {
//      transport:"compressed", method:"hilbert-raw"|"hilbert-lz4", version:1,
//      origin:[ox,oy,oz], scale:<number>, shape:[N,3], data:"<base64 of interleaved uint16 xyz>"
//    }
// 2) Legacy diff-encoded payload (compressed_distances/colors/first_color/sorted_indices)

import { useState } from "react";

/* ----------------------------- Utilities ----------------------------- */

function base64ToUint8Array(b64) {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/* ----------------------------- Hilbert (compat for legacy schema) ----------------------------- */

class Hilbert3D {
  constructor(order = 3) {
    this.order = order;
    this.size = Math.pow(2, order);
  }

  hilbertDistance(x, y, z) {
    let n = this.size;
    let d = 0;
    for (let s = this.order - 1; s >= 0; s--) {
      const rx = (x >> s) & 1;
      const ry = (y >> s) & 1;
      const rz = (z >> s) & 1;
      d += ((rx ^ ry ^ rz) * Math.pow(n, 3)) / 4;
      [x, y, z] = this._rotate(n, x, y, z, rx, ry, rz);
      n = Math.floor(n / 2);
    }
    return Math.floor(d);
  }

  _rotate(n, x, y, z, rx, ry, rz) {
    if (rz === 0) {
      if (ry === 0) [x, y] = [y, x];
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
    }
    return [x, y, z];
  }

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

  _unrotate(n, x, y, z, rx, ry, rz) {
    if (rz === 0) {
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
      if (ry === 0) [x, y] = [y, x];
    }
    return [x, y, z];
  }
}

/* ----------------------------- Main decoder ----------------------------- */

export class PointCloudDecompressor {
  constructor(hilbertOrder = 3) {
    // Order is only used for legacy diff-encoded payloads.
    this.hilbert = new Hilbert3D(hilbertOrder);
    this.maxCoord = this.hilbert.size - 1;
  }

  /**
   * NEW packed Hilbert schema from backend:
   * {
   *   data: "<base64>", origin:[ox,oy,oz], scale:Number, shape:[N,3], method:"hilbert-raw"|"hilbert-lz4"
   * }
   */
  decodePackedHilbert(payload) {
    const { data, origin, scale, shape, method } = payload || {};
    if (!data || !origin || typeof scale !== "number" || !Array.isArray(shape) || shape.length !== 2) {
      throw new Error("Invalid packed Hilbert payload");
    }

    // 1) base64 -> bytes
    let u8 = base64ToUint8Array(data);

    // 2) If compressed with LZ4, you need a browser LZ4 decoder.
    if (method && method.includes("lz4")) {
      // Add an LZ4 decoder (e.g., lz4js or WASM) and decompress here.
      // Until then, set backend to "hilbert-raw".
      throw new Error(
        "LZ4-compressed payload received but no LZ4 decoder is available in the frontend. " +
        "Add an LZ4 decoder or force backend to 'hilbert-raw'."
      );
    }

    // 3) Interpret as interleaved uint16 little-endian [x0,y0,z0, x1,y1,z1, ...]
    const N = shape[0] | 0;
    const expectedBytes = N * 3 * 2;
    if (u8.byteLength !== expectedBytes) {
      console.warn(`Byte length mismatch: got ${u8.byteLength}, expected ${expectedBytes}`);
    }
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    // 4) Dequantize to metric space; color default (pointcloud = green-ish)
    const points = new Array(N);
    for (let i = 0; i < N; i++) {
      const xq = view.getUint16((i * 3 + 0) * 2, true); // little-endian
      const yq = view.getUint16((i * 3 + 1) * 2, true);
      const zq = view.getUint16((i * 3 + 2) * 2, true);
      points[i] = {
        x: origin[0] + scale * xq,
        y: origin[1] + scale * yq,
        z: origin[2] + scale * zq,
        r: 100, g: 255, b: 100
      };
    }
    return points;
  }

  /**
   * Legacy diff-encoded schema (kept for backward compat):
   * {
   *   compressed_distances:number[],
   *   compressed_colors:[dr,dg,db][],
   *   first_color:[r,g,b],
   *   sorted_indices:number[],
   *   norm_params?:{min_vals:[x,y,z], max_vals:[x,y,z]},
   *   hilbert_order?:number,
   *   max_coord?:number
   * }
   */
  decodeDiffEncoded(payload) {
    const {
      compressed_distances,
      compressed_colors,
      first_color,
      sorted_indices,
      norm_params,
      hilbert_order,
      max_coord
    } = payload || {};

    if (
      !Array.isArray(compressed_distances) ||
      !Array.isArray(compressed_colors) ||
      !Array.isArray(first_color) ||
      !Array.isArray(sorted_indices)
    ) {
      throw new Error("Invalid diff-encoded payload");
    }

    // Align orders if provided
    if (typeof hilbert_order === "number" && hilbert_order !== this.hilbert.order) {
      this.hilbert = new Hilbert3D(hilbert_order);
      this.maxCoord = typeof max_coord === "number" ? max_coord : (this.hilbert.size - 1);
    }

    // Distances: [d0, d1-d0, ...] => [d0, d1, ...]
    const dists = new Array(compressed_distances.length);
    let acc = 0;
    for (let i = 0; i < compressed_distances.length; i++) {
      acc += compressed_distances[i];
      dists[i] = acc;
    }

    // Colors
    const colors = new Array(compressed_colors.length);
    let cr = first_color[0] | 0, cg = first_color[1] | 0, cb = first_color[2] | 0;
    for (let i = 0; i < compressed_colors.length; i++) {
      const [dr, dg, db] = compressed_colors[i];
      cr = Math.max(0, Math.min(255, Math.round(cr + dr)));
      cg = Math.max(0, Math.min(255, Math.round(cg + dg)));
      cb = Math.max(0, Math.min(255, Math.round(cb + db)));
      colors[i] = [cr, cg, cb];
    }

    const normMin = norm_params?.min_vals;
    const normMax = norm_params?.max_vals;
    const haveNorm = Array.isArray(normMin) && Array.isArray(normMax);

    // Rebuild Hilbert cube integer coords -> (optionally) de-normalize to metric space
    const sortedPts = new Array(dists.length);
    for (let i = 0; i < dists.length; i++) {
      const [xi, yi, zi] = this.hilbert.distanceToPoint(Math.floor(dists[i]));
      if (haveNorm) {
        const nx = xi / this.maxCoord;
        const ny = yi / this.maxCoord;
        const nz = zi / this.maxCoord;
        sortedPts[i] = [
          nx * (normMax[0] - normMin[0]) + normMin[0],
          ny * (normMax[1] - normMin[1]) + normMin[1],
          nz * (normMax[2] - normMin[2]) + normMin[2],
        ];
      } else {
        // Fallback: integer cube coords only (not metric)
        sortedPts[i] = [xi, yi, zi];
      }
    }

    // Unsort back to original order
    const N = sorted_indices.length;
    const out = new Array(N);
    const M = Math.min(N, sortedPts.length, colors.length);
    for (let i = 0; i < M; i++) {
      const dst = sorted_indices[i] | 0;
      const p = sortedPts[i];
      const c = colors[i];
      if (dst >= 0 && dst < N) {
        out[dst] = { x: p[0], y: p[1], z: p[2], r: c[0], g: c[1], b: c[2] };
      }
    }
    return out.filter(Boolean);
  }

  /**
   * Auto-detect schema and decode.
   */
  decompressPointCloud(payload) {
    if (payload && payload.data && payload.origin && typeof payload.scale === "number") {
      return this.decodePackedHilbert(payload);
    }
    if (payload && payload.compressed_distances) {
      return this.decodeDiffEncoded(payload);
    }
    throw new Error("Unknown pointcloud payload schema");
  }
}

/* ----------------------------- React hook ----------------------------- */

export const usePointCloudDecompressor = () => {
  // If you still consume legacy payloads, pass the server order (3 by default).
  const [decompressor] = useState(() => new PointCloudDecompressor(3));

  const decompressPoints = (compressedData) => {
    try {
      return decompressor.decompressPointCloud(compressedData);
    } catch (error) {
      console.error("Decompression failed:", error);
      return null;
    }
  };

  return { decompressPoints };
};
