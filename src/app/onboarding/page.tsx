"use client";
import { useEffect } from 'react';
import { useAuthStore } from '@/storage/authStore';
import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";
import PathLoaderSpinner from "@/components/ui/loader/PathLoaderSpinner";

// Import all step components
import SelfChange from "@/pages/Onboarding/SelfChange";
import LearningStyles from "@/pages/Onboarding/LearningStyles";
import MediaPreferences from "@/pages/Onboarding/MediaPreferences";
import PersonalDetails from "@/pages/Onboarding/PersonalDetails";
import PersonalizedPath from "@/pages/Onboarding/PersonalisedPath";

function OnboardingPage() {
    // Get state and setters from the Zustand store
    const { redirectionStep, setRedirectionStep, user, loading } = useAuthStore();

    // Debug: Log every render to trace the flow
    console.log(`OnboardingPage rendering - Current Step: ${redirectionStep}, User exists: ${!!user}, Auth Loading: ${loading}`);

    // *** THIS IS THE CRITICAL FIX ***
    // This effect is the single source of truth for automatically advancing to Step 5.
    useEffect(() => {
        // Don't do anything if we are still loading the initial auth state
        if (loading) {
            return;
        }

        // The `user` object is updated by PersonalDetails.tsx after successful OTP verification.
        // The backend guarantees that a verified user object will have the `curatedPaths` key.
        // This effect will run when `user` changes.
        if (user && user.curatedPaths && redirectionStep !== 5) {
            console.log("User with curatedPaths detected. Redirecting to Step 5.");
            setRedirectionStep(5);
        } else if (redirectionStep === null) {
            // Initialize to step 1 if it's not set (e.g., first visit)
            console.log("No step found, initializing to Step 1.");
            setRedirectionStep(1);
        }
    }, [user, redirectionStep, loading, setRedirectionStep]);


    // Render the current step component based on the redirectionStep state
    const renderCurrentStep = () => {
        console.log(`Rendering step component for step: ${redirectionStep}`);

        switch (redirectionStep) {
            case 1:
                return <SelfChange />;
            case 2:
                return <LearningStyles />;
            case 3:
                return <MediaPreferences />;
            case 4:
                return <PersonalDetails />;
            case 5:
                // This step has its own internal loading/error/success states
                return <PersonalizedPath />;
            default:
                // Fallback and initial loading state
                return (
                    <div className="flex flex-col items-center justify-center h-[70vh]">
                        <PathLoaderSpinner />
                        <p className="mt-4 text-gray-600">Loading Onboarding...</p>
                    </div>
                );
        }
    };

    return (
        <div>
            <Navbar />
            {renderCurrentStep()}
            <Footer />
        </div>
    );
}

export default OnboardingPage;