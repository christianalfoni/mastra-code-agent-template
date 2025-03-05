import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getAuth,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  tenantId?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  const auth = getAuth();
  const functions = getFunctions();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          // Check if user has tenant claims
          const idTokenResult = await currentUser.getIdTokenResult();
          const hasClaims =
            idTokenResult.claims.tenantId && idTokenResult.claims.projectId;

          if (hasClaims) {
            setTenantId(idTokenResult.claims.tenantId as string);
            setProjectId(idTokenResult.claims.projectId as string);
          } else {
            // Call the Cloud Function to set tenant claims
            const setTenantClaimFn = httpsCallable(functions, "setTenantClaim");
            const result = await setTenantClaimFn();
            const data = result.data as {
              tenantId: string;
              projectId: string;
              success: boolean;
            };

            if (data.success) {
              // Force refresh the token to get the updated claims
              await currentUser.getIdToken(true);

              // Get the updated claims
              const newTokenResult = await currentUser.getIdTokenResult(true);
              setTenantId(newTokenResult.claims.tenantId as string);
              setProjectId(newTokenResult.claims.projectId as string);

              console.log(
                "Successfully set tenant claims:",
                newTokenResult.claims
              );
            }
          }
        } catch (err) {
          console.error("Error processing authentication:", err);
          setError("Failed to set tenant permissions. Please try again.");
        }
      } else {
        setUser(null);
        setTenantId(undefined);
        setProjectId(undefined);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth, functions]);

  const handleSignIn = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Sign-in error:", err);
      setError("Sign-in failed. Please try again.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out error:", err);
      setError("Sign-out failed. Please try again.");
    }
  };

  const value = {
    user,
    loading,
    error,
    signIn: handleSignIn,
    signOut: handleSignOut,
    tenantId,
    projectId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
