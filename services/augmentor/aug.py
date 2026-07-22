import cv2
import numpy as np


def box_blur(img, kernel=3):
    return cv2.blur(img, (kernel, kernel))


def median_blur(img, kernel=3):
    return cv2.medianBlur(img, kernel)


def gaussian_blur(img, kernel=3, sigma=1):
    return cv2.GaussianBlur(img, (kernel, kernel), sigma)


def sharpen(img):
    kernel = np.array([
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0],
    ])
    return cv2.filter2D(img, -1, kernel)


def gaussian_noise(img, mean=0, stddev=25):
    noise = np.random.normal(mean, stddev, img.shape).astype(np.int16)
    noisy = img.astype(np.int16) + noise
    return np.clip(noisy, 0, 255).astype(np.uint8)


def snp_noise(img, amount=0.01):
    noisy = img.copy()
    total_pixels = img.shape[0] * img.shape[1]
    num_salt = int(np.ceil(amount * total_pixels * 0.5))
    num_pepper = int(np.ceil(amount * total_pixels * 0.5))
    for _ in range(num_salt):
        y, x = np.random.randint(0, img.shape[0]), np.random.randint(0, img.shape[1])
        noisy[y, x] = [255] * 3
    for _ in range(num_pepper):
        y, x = np.random.randint(0, img.shape[0]), np.random.randint(0, img.shape[1])
        noisy[y, x] = [0] * 3
    return noisy


def rotate(img, angle=0):
    (h, w) = img.shape[:2]
    matrix = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(img, matrix, (w, h))


def flip(img, mode="horizontal"):
    if mode == "vertical":
        return cv2.flip(img, 0)
    if mode == "both":
        return cv2.flip(img, -1)
    return cv2.flip(img, 1)


def posterize(img, levels=2):
    shift = max(1, 256 // levels)
    return (img // shift) * shift


def cutout(img, mask_size=50):
    h, w = img.shape[:2]
    y = np.random.randint(h)
    x = np.random.randint(w)
    y1 = np.clip(y - mask_size // 2, 0, h)
    y2 = np.clip(y + mask_size // 2, 0, h)
    x1 = np.clip(x - mask_size // 2, 0, w)
    x2 = np.clip(x + mask_size // 2, 0, w)
    img[y1:y2, x1:x2] = 0
    return img


def erode(img, kernel_size=3, iterations=1):
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.erode(img, kernel, iterations=iterations)


def dilate(img, kernel_size=3, iterations=1):
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    return cv2.dilate(img, kernel, iterations=iterations)


def adjust_brightness_contrast(img, brightness=0, contrast=0):
    alpha = 1 + contrast / 100.0
    beta = brightness
    return cv2.convertScaleAbs(img, alpha=alpha, beta=beta)


def edge_detection(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 100, 200)
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
