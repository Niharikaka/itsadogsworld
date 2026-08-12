# It's a Dog's World

A browser-based prototype for a private dog-diary globe.

## Current prototype

- Upload a dog drawing
- Generate a real displaced 3D surface from the visible artwork in-browser
- Rotate and zoom the result
- Try safe idle motion: gentle bob, soft sway, breathe, or still
- Add a private note stored only in the current browser with `localStorage`
- No note analysis

## Deployment

This repository is intentionally static and Vercel-ready. Import the GitHub repository into Vercel and deploy with the default settings.

## Important limitation

The current 3D step is a preserved 2.5D relief/displacement model, not full AI image-to-volumetric-3D reconstruction or skeletal rigging. It is designed as a stable prototype for the interaction and preservation principle.
