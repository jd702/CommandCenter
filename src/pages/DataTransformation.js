// Import React and hooks for state, refs, effects, and callbacks
import React, { useState, useRef, useEffect, useCallback } from "react";
// Import axios for HTTP requests
import axios from "axios";
// Import Material UI components for UI layout and controls
import {
  Container,
  Typography,
  Box,
  Button,
  Grid,
  Checkbox,
  FormControlLabel,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  CircularProgress,
} from "@mui/material";
// Import react-dropzone for drag-and-drop file upload
import { useDropzone } from "react-dropzone";
// Import image comparison component
import ReactCompareImage from "react-compare-image";

// Define available filters and their parameters
const filters = {
  box_blur: ["box_blur_kernel"],
  median_blur: ["median_blur_kernel"],
  gaussian_blur: ["gaussian_blur_kernel", "gaussian_blur_sigma"],
  sharpen: [],
  gaussian_noise: ["gaussian_noise_mean", "gaussian_noise_stddev"],
  snp_noise: ["snp_noise_amount"],
  rotate: ["rotate_angle"],
  flip: ["flip_mode"],
  posterize: ["posterize_levels"],
  cutout: ["cutout_mask_size"],
  erode: ["erode_kernel_size", "erode_iterations"],
  dilate: ["dilate_kernel_size", "dilate_iterations"],
  edge_detection: [],
  adjust_brightness_contrast: ["brightness", "contrast"],

};

const AugmentorUploader = () => {
  // Reference to the canvas for live preview
  const canvasRef = useRef(null);
  // State for loading spinner
  const [loading, setLoading] = useState(false);
  // State for uploaded image file
  const [images, setImages] = useState([]); // mutiple images
  // State for processed image URL
const [processedImageUrl, setProcessedImageUrl] = useState([]); 
  // State for original filename
  const [filename, setFilename] = useState(null);
  // State for filter parameters
  const [params, setParams] = useState({});
  // State for live preview controls
  const [rotation, setRotation] = useState(0);
  const [blur, setBlur] = useState(0);
  const [brightness, setBrightness] = useState(100);

  // Handle file drop event
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (acceptedFiles.length > 0) {
      setImages(acceptedFiles);
      setFilename(acceptedFiles.map((f) => f.name).join(", "));
    }
  }, []);

  // Set up dropzone for image upload
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: true,
  });

  // Update canvas preview when image or controls change
  useEffect(() => {
    if (!images || images.length === 0) return;

    // Get canvas and context
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    // Create a new Image object for the uploaded file
    const img = new Image();

    // When the image loads, draw it on the canvas with transformations
    img.onload = () => {
      // Clear previous drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      // Move origin to center for rotation
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Rotate canvas by the specified angle
      ctx.rotate((rotation * Math.PI) / 180);
      // Apply blur and brightness filters
      ctx.filter = `blur(${blur}px) brightness(${brightness}%)`;
      // Draw the image centered on the canvas
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    };

    // Set image source to the uploaded file
    img.src = URL.createObjectURL(images[0]);
    }, [images, rotation, blur, brightness]);

  // Handle filter checkbox change
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setParams((prev) => ({ ...prev, [name]: checked }));
  };

  // Handle filter parameter input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  // Handle form submission to upload and process images
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!images || images.length === 0) return alert("Please select an image.");

  // Create FormData object to send files and parameters
  const formData = new FormData();

  // Append each selected image
  images.forEach((file) => {
    formData.append("file", file);
  });

  // Append selected filters and their parameters
  Object.entries(filters).forEach(([filter, inputs]) => {
    if (params[filter]) {
      formData.append(filter, "on");
      inputs.forEach((input) => {
        if (params[input]) {
          formData.append(input, params[input]);
        }
      });
    }
  });

  try {
    setLoading(true);

    // Send POST request to backend
    const res = await axios.post("http://localhost:5000/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    // Set processed image URLs from the backend response
    const urls = res.data.processed.map(file =>
      `http://localhost:5000/processed/${file.filename}?t=${Date.now()}`
    );
    setProcessedImageUrl(urls);

  } catch (err) {
  console.error("Upload failed:", err);

  if (err.response) {
    // The request was made and the server responded with a status code outside 2xx
    console.error("Status:", err.response.status);
    console.error("Data:", err.response.data);
    console.error("Headers:", err.response.headers);
    alert(`Upload failed: ${err.response.status} - ${err.response.data?.error || 'Unknown server error'}`);
  } else if (err.request) {
    // The request was made but no response was received
    console.error("Request made but no response:", err.request);
    alert("Upload failed: No response from server.");
  } else {
    // Something happened in setting up the request
    console.error("Request setup error:", err.message);
    alert("Upload failed: Request setup issue.");
  }
} finally {
  setLoading(false);
}
};

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      {/* Page title */}
      <Typography variant="h4" align="center" gutterBottom>
        Data Transformations with Live Canvas Preview
      </Typography>

      {/* Dropzone for image upload */}
      <Box {...getRootProps()} sx={{
        border: "2px dashed #888",
        padding: 3,
        borderRadius: 2,
        textAlign: "center",
        backgroundColor: isDragActive ? "#eee" : "#fafafa",
        cursor: "pointer",
      }}>
        <input {...getInputProps()} />
        {isDragActive
          ? <Typography>Drop the image here...</Typography>
          : <Typography>Drag & drop an image, or click to select</Typography>}
      </Box>

      {/* Show live preview if image is selected */}
      {images && (
        <Box mt={3} textAlign="center">
          <Typography variant="h6">Live Preview</Typography>
          {/* Canvas for live preview */}
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            style={{ border: "1px solid #ccc", marginTop: 10 }}
          />
          <Box mt={2} display="flex" flexWrap="wrap" textAlign="center">
          {images.map((file, i) => (
        <img
          key={i}
          src={URL.createObjectURL(file)}
          alt={`preview-${i}`}
          style={{ width: 100, height: 100, objectFit: "cover", margin: 5, textAlign: "center" }}  
          />
      ))}
        </Box>

          {/* Controls for rotation, blur, brightness */}
          <Grid container spacing={2} mt={2}>
            <Grid item xs={12}>
              <Typography>Rotation: {rotation}°</Typography>
              <input
                type="range"
                min="0"
                max="360"
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography>Blur: {blur}px</Typography>
              <input
                type="range"
                min="0"
                max="10"
                value={blur}
                onChange={(e) => setBlur(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography>Brightness: {brightness}%</Typography>
              <input
                type="range"
                min="50"
                max="150"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Filter selection form */}
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 4, p: 4, boxShadow: 3, borderRadius: 2 }}>
        <Grid container spacing={2}>
          {/* Render filter checkboxes and parameter inputs */}
          {Object.entries(filters).map(([filter, inputs]) => (
            <Grid item xs={12} key={filter}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!!params[filter]}
                    onChange={handleCheckboxChange}
                    name={filter}
                  />
                }
                label={filter.replace(/_/g, " ")}
              />
              {/* Render parameter input fields if filter is selected */}
              {params[filter] &&
                inputs.map((input) => {
                  // Render select for mode parameters
                  if (input.includes("mode")) {
                    return (
                      <FormControl fullWidth sx={{ mt: 1 }} key={input}>
                        <InputLabel>{input.replace(/_/g, " ")}</InputLabel>
                        <Select
                          name={input}
                          value={params[input] || ""}
                          onChange={handleInputChange}
                        >
                          <MenuItem value="horizontal">Horizontal</MenuItem>
                          <MenuItem value="vertical">Vertical</MenuItem>
                          <MenuItem value="both">Both</MenuItem>
                        </Select>
                      </FormControl>
                    );
                  }
                  // Render number input for other parameters
                  return (
                    <TextField
                      key={input}
                      type="number"
                      label={input.replace(/_/g, " ")}
                      name={input}
                      value={params[input] || ""}
                      onChange={handleInputChange}
                      fullWidth
                      sx={{ mt: 1 }}
                    />
                    
                  );
                      
                })}
            </Grid>
          ))}
        </Grid>

        {/* Submit button */}
        <Button variant="contained" type="submit" fullWidth sx={{ mt: 3 }} disabled={loading}>
          {loading ? <CircularProgress size={24} /> : "Upload and Transform"}
        </Button>
      </Box>

      {/* Show comparisons if multiple processed images are available */}
  {processedImageUrl.length > 0 && images.length > 0 && (
  <Box sx={{ textAlign: "center", mt: 4 }}>
    <Typography variant="h5" gutterBottom>
      Compare Original and Processed Images
    </Typography>

    {/* Loop through each image and display a comparison slider and download link */}
    {images.map((imgFile, index) => (
      <Box key={index} sx={{ mt: 4 }}>
        {/* Image comparison slider */}
        <ReactCompareImage
          key={processedImageUrl[index]}
          leftImage={URL.createObjectURL(imgFile)}
          rightImage={processedImageUrl[index]}
          leftImageLabel="Original"
          rightImageLabel="Processed"
          sliderLineWidth={2}
        />

        {/* Download processed image */}
        <Button
          variant="contained"
          href={processedImageUrl[index]}
          download={`processed_${imgFile.name}`}
          sx={{ mt: 2 }}
        >
          Download Processed Image
        </Button>
      </Box>
    ))}
  </Box>
)}

    </Container>
  );
};

export default AugmentorUploader;
