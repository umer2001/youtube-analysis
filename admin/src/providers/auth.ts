import { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "./supabase-client";

const GUEST_STORAGE_KEY = "yt_analysis_guest_mode";

export const isGuestSession = (): boolean => {
  return typeof window !== "undefined" && localStorage.getItem(GUEST_STORAGE_KEY) === "true";
};

const authProvider: AuthProvider = {
  login: async ({ email, password, providerName, isGuest }) => {
    try {
      if (isGuest) {
        localStorage.setItem(GUEST_STORAGE_KEY, "true");
        return {
          success: true,
          redirectTo: "/",
        };
      }

      // sign in with oauth
      if (providerName) {
        localStorage.removeItem(GUEST_STORAGE_KEY);
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider: providerName,
        });

        if (error) {
          return {
            success: false,
            error,
          };
        }

        if (data?.url) {
          return {
            success: true,
            redirectTo: "/",
          };
        }
      }

      // sign in with email and password
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data?.user) {
        localStorage.removeItem(GUEST_STORAGE_KEY);
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Login failed",
        name: "Invalid email or password",
      },
    };
  },
  register: async ({ email, password }) => {
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Register failed",
        name: "Invalid email or password",
      },
    };
  },
  forgotPassword: async ({ email }) => {
    try {
      const { data, error } = await supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/update-password`,
        }
      );

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: {
        message: "Forgot password failed",
        name: "Invalid email",
      },
    };
  },
  updatePassword: async ({ password }) => {
    try {
      const { data, error } = await supabaseClient.auth.updateUser({
        password,
      });

      if (error) {
        return {
          success: false,
          error,
        };
      }

      if (data) {
        return {
          success: true,
          redirectTo: "/",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }
    return {
      success: false,
      error: {
        message: "Update password failed",
        name: "Invalid password",
      },
    };
  },
  logout: async () => {
    localStorage.removeItem(GUEST_STORAGE_KEY);
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: true,
      redirectTo: "/login",
    };
  },
  onError: async (error) => {
    console.error(error);
    return { error };
  },
  check: async () => {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const { session } = data;

      if (session) {
        return {
          authenticated: true,
        };
      }

      if (isGuestSession()) {
        return {
          authenticated: true,
        };
      }

      return {
        authenticated: false,
        error: {
          message: "Check failed",
          name: "Session not found",
        },
        logout: true,
        redirectTo: "/login",
      };
    } catch (error: any) {
      if (isGuestSession()) {
        return {
          authenticated: true,
        };
      }

      return {
        authenticated: false,
        error: error || {
          message: "Check failed",
          name: "Not authenticated",
        },
        logout: true,
        redirectTo: "/login",
      };
    }
  },
  getPermissions: async () => {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session?.user) {
      return data.session.user.role;
    }

    if (isGuestSession()) {
      return "guest";
    }

    return null;
  },
  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getSession();

    if (data?.session?.user) {
      const user = data.session.user;
      return {
        ...user,
        name: user.email,
        fullName: user.email || "Admin",
        firstName: "Admin",
        lastName: "",
      };
    }

    if (isGuestSession()) {
      return {
        id: "guest",
        name: "Guest (Read-Only)",
        fullName: "Guest User",
        firstName: "Guest",
        lastName: "(Read-Only)",
        email: "Read-only access",
      };
    }

    return null;
  },
};

export default authProvider;
