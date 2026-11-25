"""Small constant-velocity Kalman filter for metric site coordinates."""
import numpy as np

class ConstantVelocityKalman:
    def __init__(self, x: float, y: float, process_noise: float = 1.0, measurement_noise: float = 4.0):
        self.state = np.array([[x],[y],[0.0],[0.0]],dtype=float); self.covariance=np.eye(4)*10
        self.q=process_noise; self.r=np.eye(2)*measurement_noise

    def predict(self, dt: float) -> list[float]:
        f=np.array([[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]],dtype=float)
        self.state=f@self.state; self.covariance=f@self.covariance@f.T+np.eye(4)*self.q
        return [float(self.state[0,0]),float(self.state[1,0])]

    def update(self, x: float, y: float) -> list[float]:
        h=np.array([[1,0,0,0],[0,1,0,0]],dtype=float); z=np.array([[x],[y]],dtype=float)
        innovation=z-h@self.state; s=h@self.covariance@h.T+self.r; gain=self.covariance@h.T@np.linalg.inv(s)
        self.state=self.state+gain@innovation; self.covariance=(np.eye(4)-gain@h)@self.covariance
        return [float(self.state[0,0]),float(self.state[1,0])]
