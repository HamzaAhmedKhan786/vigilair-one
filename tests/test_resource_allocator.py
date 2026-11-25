from backend.resource_allocator import allocate

def test_high_risk_allocates_observation_resources_only():
    result = allocate("VIG-042",86)
    assert result["physical_control"] is False
    assert {item["kind"] for item in result["allocations"]} == {"camera","operator","recorder"}
