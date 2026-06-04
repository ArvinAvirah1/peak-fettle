/**
 * log.tsx — TICKET-084 redirect
 *
 * The logging state machine has been relocated to WorkoutLoggerHost.tsx
 * (mounted on the Home tab). Any lingering navigation to /(tabs)/log
 * lands here and is immediately redirected to Home, which hosts the logger.
 */
import { Redirect } from 'expo-router';

export default function LogRedirect() {
  return <Redirect href="/(tabs)" />;
}
