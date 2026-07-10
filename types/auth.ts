export interface SendOtpRequest {
  email: string;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export interface ApiResponse {
  success?: boolean;
  error?: string;
  token?: string;
}