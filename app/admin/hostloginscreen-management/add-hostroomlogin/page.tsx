'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import UsernameEntry from '@/components/hostscreenlogin-component/Username';
import CreatePassword from '@/components/hostscreenlogin-component/CreatePassword';
import SavePasswordPrompt from '@/components/hostscreenlogin-component/SavePassword';

type Step = 'username' | 'create-password' | 'save-password';

// Create axios instance
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || '',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default function Addhostloginform() {
    const [step, setStep] = useState<Step>('username');
    const [email, setEmail] = useState<string>('');
    const [createdPassword, setCreatedPassword] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    // Handle username/email submission
    const handleUsernameSubmit = (username: string) => {
        setEmail(username);
        setStep('create-password');
    };

    // Handle password creation - Create host account
    const handlePasswordCreate = async (password: string) => {
        setCreatedPassword(password);
        
        try {
            setLoading(true);
            
            // Call API to create host account
            const response = await api.post('/api/auth/host/create-host', {
                email: email,
                temporaryPassword: password,
                // You might want to add firstName, lastName fields
                firstName: email.split('@')[0].split('.')[0] || 'Host',
                lastName: email.split('@')[0].split('.')[1] || 'User',
            });
            
            if (response.data.success) {
                setStep('save-password');
            } else {
                alert(response.data.error || 'Failed to create host account');
            }
        } catch (error) {
            console.error('Error creating host:', error);
            if (axios.isAxiosError(error)) {
                alert(error.response?.data?.error || 'Failed to create host account');
            } else {
                alert('An error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle save password - Yes (save credentials and redirect)
    const handleSavePasswordYes = async () => {
        try {
            setLoading(true);
            
            // Login with the new credentials
            const response = await api.post('/api/auth/login', {
                email: email,
                password: createdPassword,
            });
            
            if (response.data.success) {
                // Redirect to host dashboard or admin panel
                router.push('/admin/hostloginscreen-management/hostroomlogin-list'); // or wherever you want to redirect
            } else {
                alert('Login failed. Please try again.');
            }
        } catch (error) {
            console.error('Error during login:', error);
            if (axios.isAxiosError(error)) {
                alert(error.response?.data?.error || 'Login failed');
            } else {
                alert('An error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle save password - No (just redirect without saving locally)
    const handleSavePasswordNo = async () => {
        try {
            setLoading(true);
            
            // Login with the new credentials
            const response = await api.post('/api/auth/login', {
                email: email,
                password: createdPassword,
            });
            
            if (response.data.success) {
                router.push('/admin/hostloginscreen-management/hostroomlogin-list');
            } else {
                alert('Login failed. Please try again.');
            }
        } catch (error) {
            console.error('Error during login:', error);
            if (axios.isAxiosError(error)) {
                alert(error.response?.data?.error || 'Login failed');
            } else {
                alert('An error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (step === 'create-password') {
            setStep('username');
        } else if (step === 'save-password') {
            setStep('create-password');
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'username':
                return <UsernameEntry onUsernameSubmit={handleUsernameSubmit} loading={loading} />;
            case 'create-password':
                return (
                    <CreatePassword 
                        phone={email} 
                        onPasswordCreate={handlePasswordCreate}
                        onBack={handleBack}
                        loading={loading}
                    />
                );
            case 'save-password':
                return (
                    <SavePasswordPrompt 
                        phone={email}
                        onYes={handleSavePasswordYes}
                        onNo={handleSavePasswordNo}
                        onBack={handleBack}
                        loading={loading}
                    />
                );
            default:
                return <UsernameEntry onUsernameSubmit={handleUsernameSubmit} loading={loading} />;
        }
    };

    return <>{renderStep()}</>;
}