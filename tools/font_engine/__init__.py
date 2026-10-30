"""煉金體（Alchemy Font）模組化字型引擎"""
from .primitives import bar, wing, dot, ring, T, transform, render_svg_elements
from .layouts import combine, place, left_right, top_bottom, semi_enclose_top_left, full_enclose
from .components import (
    RAD_FIRE_LEFT, BODY_JIAN, RAD_GUANG, BODY_LIANG_IN_LANG, RAD_EAR_RIGHT, BODY_LANG_FULL,
    RAD_WATER_LEFT, RAD_WOOD_LEFT, RAD_GRAIN_LEFT, RAD_EARTH_LEFT, RAD_STEP_LEFT, RAD_ROOF_MIAN,
    COMP_SUN, COMP_MOON, COMP_WOOD, COMP_EARTH, COMP_WATER, COMP_GATE, COMP_LIGHT
)
from .style import Style, MONO, DISPLAY, TEXT
from .ids import compose, FORMS, RULES
from .optics import optical, OPTICS
from .metrics import scorecard, summary
from .registry import GLYPH_REGISTRY
