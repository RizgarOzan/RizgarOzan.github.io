"""Oblivion: same source and pipeline as Oathkeeper, see import_oathkeeper.py.

blender -b --factory-startup -P tools/blender/import_oblivion.py
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
from import_oathkeeper import main

main('oblivion')
