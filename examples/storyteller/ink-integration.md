# Storyteller Example: Ink / Inkly Integration

Bridge Ink choices to command selection:

1. Ink choice: `> [Press forward]`
2. Map to command profile: `lineInfantry + aggressive target focus`
3. Run simulation tick block
4. Pass results through `describeAction` and `explainOutcome`
5. Emit prose back into Ink variables:

```ink
VAR last_combat_line = ""
VAR last_explanation = ""

=== combat_turn ===
{last_combat_line}
{last_explanation}
+ [Press forward]
  ~ command_profile = "aggressive"
  -> continue
+ [Hold shield wall]
  ~ command_profile = "defensive"
  -> continue
```

This keeps player choices grounded in actual sim outcomes while preserving story readability.
