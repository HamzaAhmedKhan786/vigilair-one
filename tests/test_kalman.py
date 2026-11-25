from backend.kalman import ConstantVelocityKalman

def test_kalman_update_and_prediction_are_finite():
    tracker=ConstantVelocityKalman(0,0); tracker.update(1,1); result=tracker.predict(1)
    assert len(result)==2 and all(abs(value)<100 for value in result)
