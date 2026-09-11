"""
Prebuilt Action Engine rules and citizen-facing messages.

Per the user's request: authored, specific text for different conditions,
not a vague placeholder. This stays outside the JSON contract (contract
section 18: action is downstream), and is Sanit's Action Engine per the
Work Distribution doc -- provided here as a concrete starting table so
"the action needs to be prebuilt" isn't left undefined at demo time.

Trigger inputs (all already available without touching the JSON
contract):
  - ml_output.calibrated_probability
  - physics_output.stability_state
  - backend/severity.py's severity_band
  - backend/confidence.py's confidence_band

The combination of probability + severity + confidence is what should
decide the action, not probability alone -- a high-probability, low-
severity, low-confidence signal deserves a different response than a
high-probability, high-severity, high-confidence one. This table encodes
that as an explicit decision grid rather than one flat threshold.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ActionResult:
    action: str  # WATCH / PREPARE / RESTRICT / EVACUATE
    reason: str
    citizen_message_en: str


def decide_action(
    calibrated_probability: float,
    severity_band: str,
    confidence_band: str,
) -> ActionResult:
    """
    Decision grid (documented, adjustable -- this is a starting policy
    for the team to tune during rehearsal, not a validated safety
    threshold set):

      probability < 0.3                          -> WATCH, regardless of severity
      0.3 <= probability < 0.6                    -> PREPARE if severity >= MODERATE, else WATCH
      0.6 <= probability < 0.8                    -> RESTRICT if severity >= MODERATE, else PREPARE
      probability >= 0.8                          -> EVACUATE if severity >= MAJOR, else RESTRICT

      LOW confidence caps the action at PREPARE regardless of the above --
      i.e. the system will not recommend RESTRICT/EVACUATE on a low-
      confidence signal alone. This is a deliberate conservative design
      choice: false alarms cost less than acting on a signal the system
      itself flags as unreliable.
    """
    severity_rank = {"MINOR": 0, "MODERATE": 1, "MAJOR": 2, "CATASTROPHIC_POTENTIAL": 3}.get(severity_band, 0)

    if calibrated_probability < 0.3:
        action = "WATCH"
    elif calibrated_probability < 0.6:
        action = "PREPARE" if severity_rank >= 1 else "WATCH"
    elif calibrated_probability < 0.8:
        action = "RESTRICT" if severity_rank >= 1 else "PREPARE"
    else:
        action = "EVACUATE" if severity_rank >= 2 else "RESTRICT"

    capped = False
    if confidence_band == "LOW" and action in ("RESTRICT", "EVACUATE"):
        action = "PREPARE"
        capped = True

    reason_parts = [
        f"calibrated probability={calibrated_probability:.2f}",
        f"severity={severity_band}",
        f"confidence={confidence_band}",
    ]
    if capped:
        reason_parts.append("action capped at PREPARE due to LOW confidence signal")
    reason = "; ".join(reason_parts)

    citizen_message_en = CITIZEN_MESSAGES[action]

    return ActionResult(action=action, reason=reason, citizen_message_en=citizen_message_en)


CITIZEN_MESSAGES = {
    "WATCH": (
        "No significant landslide risk detected in your area right now. "
        "This is a routine monitoring update — no action needed."
    ),
    "PREPARE": (
        "Landslide risk conditions are developing in your area. Please keep emergency "
        "supplies ready, avoid unnecessary travel near slopes, and monitor further updates."
    ),
    "RESTRICT": (
        "Landslide risk in your area is significant. Avoid the marked slope/road area, "
        "do not travel through it, and follow instructions from local authorities."
    ),
    "EVACUATE": (
        "Landslide risk in your area is severe. Evacuate the marked area immediately and "
        "move to higher, stable ground. Follow local authority instructions."
    ),
}
