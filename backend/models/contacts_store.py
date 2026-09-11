"""
In-memory contact store. A dict is sufficient for a demo -- restarting
the backend clears contacts, which is fine for rehearsal but means
re-adding your team's numbers each fresh run. Swap for SQLite if
persistence across restarts becomes annoying during rehearsal (see
docstring at bottom for a 10-minute swap).
"""

from __future__ import annotations

import itertools
from typing import Optional

_contacts: dict = {}
_id_counter = itertools.count(1)


def add_contact(name: str, phone_number: str, latitude: float, longitude: float,
                 preferred_language: str = "en", role: str = "team_demo",
                 town: str = "Chungthang Town") -> dict:
    contact_id = f"c{next(_id_counter)}"
    contact = {
        "contact_id": contact_id, "name": name, "phone_number": phone_number,
        "latitude": latitude, "longitude": longitude,
        "preferred_language": preferred_language, "role": role,
        "town": town,
    }
    _contacts[contact_id] = contact
    return contact

# Seed initial field observers across North Sikkim corridors
if not _contacts:
    add_contact("Passang Norbu (Ward Officer)", "+919475012345", 27.5080, 88.5260, "ne", "field_observer", "Mangan Bazaar")
    add_contact("Dr. Anup Chettri (PHC Dikchu)", "+919434198765", 27.5120, 88.5340, "ne", "first_responder", "Dikchu Settlement")
    add_contact("Karma Lepcha (Panchayat Secy)", "+919733054321", 27.6020, 88.6510, "ne", "panchayat_admin", "Chungthang Town")
    add_contact("Mingma Tamang (BRO Highway Supr)", "+919832045678", 27.6280, 88.6130, "hi", "infrastructure_lead", "Lachen Road Camp")
    add_contact("Bikash Sharma (Teesta Checkpost)", "+919830089123", 27.1730, 88.5330, "bn", "transit_police", "Rangpo Township")


def list_contacts() -> list:
    return list(_contacts.values())


def delete_contact(contact_id: str) -> bool:
    return _contacts.pop(contact_id, None) is not None


def get_contact(contact_id: str) -> Optional[dict]:
    return _contacts.get(contact_id)


# --- SQLite persistence swap-in, if wanted later ---
# Replace the dict above with a `contacts` table (contact_id TEXT PRIMARY
# KEY, name TEXT, phone_number TEXT, latitude REAL, longitude REAL,
# preferred_language TEXT, role TEXT) and rewrite these four functions as
# parameterized SQL. The FastAPI routes calling this module do not need
# to change either way.
