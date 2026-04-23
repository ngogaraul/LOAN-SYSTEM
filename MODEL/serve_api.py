from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.settings import load_api_settings

import uvicorn


def main() -> None:
    settings = load_api_settings(PROJECT_ROOT)
    uvicorn.run(
        "api.app:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        server_header=False,
        proxy_headers=False,
    )


if __name__ == "__main__":
    main()
