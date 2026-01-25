"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AuthStatusProps {
    user: {
        id: string;
        email?: string | null;
        name?: string | null;
    } | null;
    signIn: () => Promise<void>;
}

export const AuthStatus: React.FC<AuthStatusProps> = ({ user, signIn }) => {
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        console.log("[AuthStatus] Iniciando logout...");
        setIsLoggingOut(true);

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log("[AuthStatus] Resultado:", result);

            if (result.success && result.logoutUrl) {
                console.log("[AuthStatus] Redirigiendo a Keycloak logout...");
                window.location.href = result.logoutUrl;
            } else {
                console.log("[AuthStatus] Redirigiendo a home...");
                window.location.href = "/";
            }
        } catch (error) {
            console.error("[AuthStatus] Error en logout:", error);
            setIsLoggingOut(false);
            window.location.href = "/";
        }
    };

    if (!user) {
        return (
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">No has iniciado sesión</p>
                <Button onClick={() => signIn()}>Iniciar sesión</Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm">
                ✅ Conectado como: <strong>{user.email || user.name || user.id}</strong>
            </p>
            <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={isLoggingOut}
            >
                {isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
            </Button>
        </div>
    );
};
