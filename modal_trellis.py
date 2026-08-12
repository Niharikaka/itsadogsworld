import base64
import io
import os
from pathlib import Path

import modal

APP_NAME = "itsadogsworld-trellis"
TRELLIS_DIR = "/root/TRELLIS.2"
MODEL_ID = "microsoft/TRELLIS.2-4B"

cuda_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-devel-ubuntu22.04",
        add_python="3.10",
    )
    .entrypoint([])
    .apt_install(
        "git",
        "sudo",
        "build-essential",
        "ninja-build",
        "libjpeg-dev",
        "libgl1",
        "libglib2.0-0",
        "ffmpeg",
    )
    .run_commands(
        "pip install --upgrade pip setuptools wheel",
        "pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124",
        "git clone -b main https://github.com/microsoft/TRELLIS.2.git --recursive /root/TRELLIS.2",
    )
    .workdir(TRELLIS_DIR)
    .run_commands(
        ". ./setup.sh --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm",
        gpu="L40S",
    )
    .env(
        {
            "OPENCV_IO_ENABLE_OPENEXR": "1",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
        }
    )
)

app = modal.App(APP_NAME)


@app.cls(
    image=cuda_image,
    gpu="L40S",
    timeout=20 * 60,
    scaledown_window=120,
)
class TrellisModel:
    @modal.enter()
    def load(self):
        import sys
        sys.path.insert(0, TRELLIS_DIR)

        import torch
        from trellis2.pipelines import Trellis2ImageTo3DPipeline

        self.torch = torch
        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained(MODEL_ID)
        self.pipeline.cuda()

    @modal.method()
    def generate(self, image_bytes: bytes, resolution: int = 1024, texture_size: int = 2048) -> bytes:
        import sys
        sys.path.insert(0, TRELLIS_DIR)

        from PIL import Image
        import o_voxel

        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        image = self.pipeline.preprocess_image(image)

        mesh = self.pipeline.run(image, resolution=resolution)[0]
        mesh.simplify(16_777_216)

        glb = o_voxel.postprocess.to_glb(
            vertices=mesh.vertices,
            faces=mesh.faces,
            attr_volume=mesh.attrs,
            coords=mesh.coords,
            attr_layout=mesh.layout,
            voxel_size=mesh.voxel_size,
            aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=500_000,
            texture_size=texture_size,
            remesh=True,
            remesh_band=1,
            remesh_project=0,
            verbose=False,
        )

        tmp = Path("/tmp/generated.glb")
        glb.export(str(tmp), extension_webp=True)
        return tmp.read_bytes()


web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]", "python-multipart")


@app.function(image=web_image, timeout=30)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, File, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, Response

    api = FastAPI(title="itsadogsworld TRELLIS.2 API")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    def health():
        return {"ok": True, "model": MODEL_ID}

    @api.post("/generate")
    async def generate(file: UploadFile = File(...), resolution: int = 1024, texture_size: int = 2048):
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty upload")
        if resolution not in (512, 1024, 1536):
            raise HTTPException(status_code=400, detail="resolution must be 512, 1024, or 1536")
        if texture_size not in (1024, 2048, 4096):
            raise HTTPException(status_code=400, detail="texture_size must be 1024, 2048, or 4096")

        glb_bytes = TrellisModel().generate.remote(raw, resolution, texture_size)
        return Response(
            content=glb_bytes,
            media_type="model/gltf-binary",
            headers={"Content-Disposition": "attachment; filename=dog.glb"},
        )

    return api
