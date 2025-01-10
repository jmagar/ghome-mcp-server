export interface SmartPlugDevice {
  id: string;
  name: string;
  type: string;
  traits: {
    'sdm.devices.traits.Info'?: {
      customName?: string;
    };
    'sdm.devices.traits.OnOff'?: {
      on: boolean;
    };
    'sdm.devices.traits.Connectivity'?: {
      status: 'ONLINE' | 'OFFLINE';
    };
  };
  state: {
    on: boolean;
    online: boolean;
  };
}

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

export interface DeviceState {
  name: string;
  type: string;
  traits: {
    'sdm.devices.traits.Info'?: {
      customName?: string;
    };
    'sdm.devices.traits.OnOff'?: {
      on: boolean;
    };
    'sdm.devices.traits.Connectivity'?: {
      status: 'ONLINE' | 'OFFLINE';
    };
  };
}

export interface ControlPlugParams {
  deviceId: string;
  state: boolean;
}

export interface GetPlugStateParams {
  deviceId: string;
} 