# Deploy TRELLIS.2 to Modal from your browser

You do not need a local computer terminal for this flow. Use GitHub Codespaces.

## 1. Open a Codespace

In this repo, click **Code → Codespaces → Create codespace on main**.

The devcontainer automatically installs the Modal CLI.

## 2. Sign in to Modal

In the Codespaces terminal run:

```bash
modal setup
```

Follow the browser login link Modal gives you.

## 3. Deploy the GPU backend

Run:

```bash
modal deploy modal_trellis.py
```

The first deployment can take a while because Modal has to build the CUDA/TRELLIS.2 image and compile several GPU extensions.

When deployment finishes, Modal will print a public `modal.run` URL for the `web` endpoint.

## 4. Test it

Open this in a browser:

```text
YOUR_MODAL_URL/health
```

You should see JSON similar to:

```json
{"ok": true, "model": "microsoft/TRELLIS.2-4B"}
```

## 5. Give ChatGPT the Modal URL

Send the `https://...modal.run` URL in this chat. The live Vercel page can then be switched from the public Hugging Face demo to your own Modal backend.

## Notes

- The backend uses an **L40S 48 GB GPU**.
- TRELLIS.2 requires at least 24 GB NVIDIA GPU memory according to Microsoft.
- Your phone only uploads the image and receives the GLB; TRELLIS.2 runs in Modal.
- The diary note should remain separate from generation and should never be sent to this endpoint.
