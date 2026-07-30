from schema import JobType as J, Operation as Op

# ══ Fahrzeuge (2,839 — the largest group in the directory) ════════════
#
# Deliberately shallow, and the reason matters.
#
# Vehicle repair is not estimated from area and condition. It is priced from
# manufacturer Arbeitswerte — AW units of 5-6 minutes, published per model and
# operation through AUDATEX, DAT or the maker's own system. A workshop looks up
# "Zahnriemen, Golf VII 1.6 TDI = 34 AW" and multiplies by its AW rate. That
# data is licensed, model-specific, and revised continuously.
#
# A generic h/m2 catalogue cannot compete with it and should not pretend to.
# What follows covers only the handful of operations that genuinely are flat
# across models, all marked low confidence. Anything model-specific belongs in
# an AW lookup, which is a licensing decision rather than a modelling one.
FAHRZEUGE = [
    J(key="kfz.service_klein", trade="montage", group="Fahrzeuge",
      segment="KFZ-Werkstatt", label_de="Kleines Service (Öl und Filter)", unit="Stk",
      setup_hours=(0.2, 0.4), typical_size=(1, 1),
      market_band_at=(120, 320), market_band_de=(130, 340), band_basis="total",
      confidence="low", note_keys=["aw_modellabhaengig", "altoel_entsorgung"],
      operations=[
          Op("arbeit", "Ölwechsel, Filter, Sichtprüfung", "Stk", (0.8, 1.5)),
          Op("material", "Öl und Filter", "Stk", (0.0, 0.0), kind="material",
             material_per_unit=(55, 150)),
      ]),
    J(key="kfz.reifenwechsel", trade="montage", group="Fahrzeuge",
      segment="KFZ-Werkstatt", label_de="Reifenwechsel (4 Räder, mit Wuchten)",
      unit="Stk", setup_hours=(0.1, 0.2), typical_size=(1, 1),
      market_band_at=(50, 120), market_band_de=(55, 130), band_basis="total",
      confidence="medium", note_keys=["rdks_sensoren"],
      operations=[Op("wechsel", "Räder wechseln und wuchten", "Stk", (0.6, 1.2))]),
    J(key="fahrrad.service", trade="montage", group="Fahrzeuge",
      segment="Fahrradwerkstatt", label_de="Fahrrad-Service (groß)", unit="Stk",
      setup_hours=(0.1, 0.3), typical_size=(1, 1),
      market_band_at=(70, 180), market_band_de=(75, 190), band_basis="total",
      confidence="medium", note_keys=["verschleissteile_extra"],
      operations=[
          Op("service", "Komplettservice", "Stk", (1.2, 2.5)),
          Op("kleinteile", "Kleinteile und Schmiermittel", "Stk", (0.0, 0.0),
             kind="material", material_per_unit=(12, 35)),
      ]),
]
