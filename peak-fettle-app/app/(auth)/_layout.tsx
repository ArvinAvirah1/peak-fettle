/**
 * Auth group layout — stack navigator for Login and Register screens.
 * No header shown; each screen handles its own back navigation.
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }} />
    );
}
