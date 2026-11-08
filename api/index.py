import sys
import os
from pathlib import Path

# Add root folder to sys.path so app and core packages are discoverable
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import app
