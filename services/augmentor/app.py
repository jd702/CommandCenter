import os

import cv2
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

from aug import (
    adjust_brightness_contrast,
    box_blur,
    cutout,
    dilate,
    edge_detection,
    erode,
    flip,
    gaussian_blur,
    gaussian_noise,
    median_blur,
    posterize,
    rotate,
    sharpen,
    snp_noise,
)


app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.environ.get("AUGMENTOR_UPLOAD_DIR", "uploads")
PROCESSED_FOLDER = os.environ.get("AUGMENTOR_PROCESSED_DIR", "processed")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["PROCESSED_FOLDER"] = PROCESSED_FOLDER


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def ensure_odd(value, default=3):
    try:
        val = int(value)
        return val if val % 2 == 1 else val + 1
    except Exception:
        return default


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/", methods=["POST"])
def transform_images():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    files = request.files.getlist("file")
    form = request.form
    results = []

    for file in files:
        if file.filename == "" or not allowed_file(file.filename):
            continue

        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        image = cv2.imread(filepath)
        if image is None:
            continue

        if form.get("box_blur"):
            image = box_blur(image, ensure_odd(form.get("box_blur_kernel", 3)))
        if form.get("median_blur"):
            image = median_blur(image, ensure_odd(form.get("median_blur_kernel", 3)))
        if form.get("gaussian_blur"):
            image = gaussian_blur(
                image,
                ensure_odd(form.get("gaussian_blur_kernel", 3)),
                int(form.get("gaussian_blur_sigma", 1)),
            )
        if form.get("sharpen"):
            image = sharpen(image)
        if form.get("gaussian_noise"):
            mean = float(form.get("gaussian_noise_mean", 0))
            stddev = max(0.0, float(form.get("gaussian_noise_stddev", 25)))
            image = gaussian_noise(image, mean, stddev)
        if form.get("snp_noise"):
            image = snp_noise(image, float(form.get("snp_noise_amount", 0)) * 0.001)
        if form.get("rotate"):
            image = rotate(image, float(form.get("rotate_angle", 0)))
        if form.get("flip"):
            image = flip(image, form.get("flip_mode", "horizontal"))
        if form.get("posterize"):
            image = posterize(image, int(form.get("posterize_levels", 2)))
        if form.get("cutout"):
            image = cutout(image, int(form.get("cutout_mask_size", 50)))
        if form.get("erode"):
            image = erode(
                image,
                ensure_odd(form.get("erode_kernel_size", 3)),
                int(form.get("erode_iterations", 1)),
            )
        if form.get("dilate"):
            image = dilate(
                image,
                ensure_odd(form.get("dilate_kernel_size", 3)),
                int(form.get("dilate_iterations", 1)),
            )
        if form.get("adjust_brightness_contrast"):
            image = adjust_brightness_contrast(
                image,
                int(form.get("brightness", 0)),
                int(form.get("contrast", 0)),
            )
        if form.get("edge_detection"):
            image = edge_detection(image)

        processed_path = os.path.join(PROCESSED_FOLDER, filename)
        cv2.imwrite(processed_path, image)
        results.append({"filename": filename, "url": f"/processed/{filename}"})

    return jsonify({"success": True, "processed": results}), 200


@app.route("/processed/<filename>")
def get_processed_image(filename):
    return send_from_directory(PROCESSED_FOLDER, filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
