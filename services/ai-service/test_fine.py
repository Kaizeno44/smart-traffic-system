# test_fine.py
# Copy 2 hàm từ file chính vào để test (hoặc import nếu bạn tách module)
# Paste từ đây:
VIOLATION_FINE_MAP = {
    "RED_LIGHT": {"min": 4_000_000, "max": 6_000_000, "legal_basis": "..."},
    "NO_HELMET": {"min": 400_000, "max": 600_000, "legal_basis": "..."},
    "OVERLOAD":  {"min": 600_000, "max": 800_000, "legal_basis": "..."},
    "WHEELIE":   {"min": 6_000_000, "max": 8_000_000, "legal_basis": "..."},
    "ZIGZAG":    {"min": 8_000_000, "max": 10_000_000, "legal_basis": "..."},
}

def get_fine_for_violation(v_type):
    return VIOLATION_FINE_MAP.get(v_type, {"min": 0, "max": 0, "legal_basis": "Chưa có quy định"})

def format_vnd(amount):
    if amount <= 0:
        return "0đ"
    return f"{amount:,}".replace(",", ".") + "đ"

def format_fine_text(v_type):
    fine = get_fine_for_violation(v_type)
    if fine["max"] == 0:
        return "Chưa xác định"
    if fine["min"] == fine["max"]:
        return format_vnd(fine["min"])
    return f"{format_vnd(fine['min'])} - {format_vnd(fine['max'])}"

# ===== Test =====
test_cases = [
    ("RED_LIGHT", "4.000.000đ - 6.000.000đ"),
    ("NO_HELMET", "400.000đ - 600.000đ"),
    ("OVERLOAD",  "600.000đ - 800.000đ"),
    ("WHEELIE",   "6.000.000đ - 8.000.000đ"),
    ("ZIGZAG",    "8.000.000đ - 10.000.000đ"),
    ("UNKNOWN",   "Chưa xác định"),
]

passed = 0
for v_type, expected in test_cases:
    result = format_fine_text(v_type)
    ok = result == expected
    passed += ok
    mark = "✅" if ok else "❌"
    print(f"{mark} {v_type:12s} → '{result}' (kỳ vọng '{expected}')")

print(f"\n{passed}/{len(test_cases)} test PASS")