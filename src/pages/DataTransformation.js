import React, { useState } from "react";
import axios from "axios";
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
  Card,
  CardMedia,
} from "@mui/material";

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
};

const AugmentorUploader = () => {
  const [image, setImage] = useState(null);
  const [processedImageUrl, setProcessedImageUrl] = useState(null);
  const [filename, setFilename] = useState(null);
  const [params, setParams] = useState({});

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setParams((prev) => ({ ...prev, [name]: checked }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setFilename(file.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image) return alert("Please select an image.");

    const formData = new FormData();
    formData.append("file", image);

    Object.entries(filters).forEach(([filter, inputs]) => {
      if (params[filter]) {
        formData.append(filter, "on");
        inputs.forEach((input) => {
          if (params[input]) formData.append(input, params[input]);
        });
      }
    });

    try {
      const res = await axios.post("http://localhost:5000/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProcessedImageUrl(`http://localhost:5000/processed/${res.data.filename}`);
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Typography variant="h4" align="center" gutterBottom>
        Data Transformation
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ p: 4, boxShadow: 3, borderRadius: 2 }}>
        <input type="file" accept="image/*" onChange={handleImageChange} required />
        <Grid container spacing={2} mt={2}>
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
              {params[filter] &&
                inputs.map((input) => {
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
        <Button variant="contained" type="submit" fullWidth sx={{ mt: 3 }}>
          Upload and Transform
        </Button>
      </Box>

      {processedImageUrl && (
        <Box sx={{ textAlign: "center", mt: 4 }}>
          <Typography variant="h5">Comparison: Original vs Processed</Typography>
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2, gap: 4 }}>
            <Card>
              <CardMedia
                component="img"
                image={URL.createObjectURL(image)}
                alt="Original"
                sx={{ maxWidth: 300 }}
              />
              <Typography align="center">Original</Typography>
            </Card>
            <Card>
              <CardMedia
                component="img"
                image={processedImageUrl}
                alt="Processed"
                sx={{ maxWidth: 300 }}
              />
              <Typography align="center">Processed</Typography>
            </Card>
          </Box>
          <Button
            variant="contained"
            href={processedImageUrl}
            download={`processed_${filename}`}
            sx={{ mt: 3 }}
          >
            Download Processed Image
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default AugmentorUploader;
