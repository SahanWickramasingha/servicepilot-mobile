import React, {
  createContext,
  ReactNode,
  useContext,
  useState,
} from "react";

type JobProgress = {
  beforePhotos: boolean;
  serviceNotes: boolean;
  afterPhotos: boolean;
  signature: boolean;
};

type ProgressKey = keyof JobProgress;

type ServiceProgressContextType = {
  getProgress: (jobId: string) => JobProgress;
  completeStep: (
    jobId: string,
    step: ProgressKey
  ) => void;
  resetProgress: (jobId: string) => void;
};

const emptyProgress: JobProgress = {
  beforePhotos: false,
  serviceNotes: false,
  afterPhotos: false,
  signature: false,
};

const ServiceProgressContext =
  createContext<ServiceProgressContextType | null>(
    null
  );

export function ServiceProgressProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [progress, setProgress] = useState<
    Record<string, JobProgress>
  >({});

  const getProgress = (jobId: string) => {
    return progress[jobId] ?? emptyProgress;
  };

  const completeStep = (
    jobId: string,
    step: ProgressKey
  ) => {
    setProgress((current) => ({
      ...current,

      [jobId]: {
        ...(current[jobId] ?? emptyProgress),
        [step]: true,
      },
    }));
  };

  const resetProgress = (jobId: string) => {
    setProgress((current) => ({
      ...current,
      [jobId]: emptyProgress,
    }));
  };

  return (
    <ServiceProgressContext.Provider
      value={{
        getProgress,
        completeStep,
        resetProgress,
      }}
    >
      {children}
    </ServiceProgressContext.Provider>
  );
}

export function useServiceProgress() {
  const context = useContext(
    ServiceProgressContext
  );

  if (!context) {
    throw new Error(
      "useServiceProgress must be used inside ServiceProgressProvider"
    );
  }

  return context;
}