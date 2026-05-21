/**
 * Tab navigator — main app bottom tabs
 *
 * Tabs (in order):
 *   Home       — today's workout + streak summary        (TICKET-017)
 *   History    — workout history + PR graph               (TICKET-018)
 *   Rankings   — percentile rankings (free tier)          (TICKET-019)
 *   Plans      — AI plans (paid tier gate)                (TICKET-020)
 *   Profile    — settings, profile, cosmetics, sign-out   (TICKET-026)
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
    name:       string;
    title:      string;
    icon:       IoniconName;
    iconFocused: IoniconName;
}

const TABS: TabConfig[] = [
    { name: 'home',     title: 'Today',    icon: 'barbell-outline',    iconFocused: 'barbell'     },
    { name: 'history',  title: 'History',  icon: 'time-outline',       iconFocused: 'time'        },
    { name: 'rankings', title: 'Rankings', icon: 'podium-outline',     iconFocused: 'podium'      },
    { name: 'plans',    title: 'Plans',    icon: 'sparkles-outline',   iconFocused: 'sparkles'    },
    { name: 'profile',  title: 'Profile',  icon: 'person-outline',     iconFocused: 'person'      },
];

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown:      false,
                tabBarStyle: {
                    backgroundColor: Colors.surface,
                    borderTopColor:  Colors.border,
                    borderTopWidth:  1,
                },
                tabBarActiveTintColor:   Colors.tabActive,
                tabBarInactiveTintColor: Colors.tabInactive,
                tabBarLabelStyle: {
                    fontSize:   11,
                    fontWeight: '500',
                },
            }}
        >
            {TABS.map((tab) => (
                <Tabs.Screen
                    key={tab.name}
                    name={tab.name}
                    options={{
                        title: tab.title,
                        tabBarIcon: ({ focused, color, size }) => (
                            <Ionicons
                                name={focused ? tab.iconFocused : tab.icon}
                                size={size}
                                color={color}
                            />
                        ),
                    }}
                />
            ))}
        </Tabs>
    );
}
