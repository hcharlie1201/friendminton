import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '../ui';

export function HostGatheringBanner({ onCreate }: { onCreate: () => void }) {
  return (
    <LinearGradient colors={['#052D64', '#0B74E5', '#21A0FF']} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={styles.banner}>
      <View pointerEvents="none" style={styles.artwork}>
        <View style={styles.courtLine} />
        <View style={styles.courtLineVertical} />
        <MaterialCommunityIcons color="#CBFF4A" name="badminton" size={86} style={styles.icon} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>BRING THE BADMINTON CROWD TOGETHER</Text>
        <Text style={styles.title}>Host a rally or hangout</Text>
        <Text style={styles.body}>Open play, board games, drinks—or both.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onCreate} style={styles.button}>
        <Text style={styles.buttonText}>Host something</Text>
        <MaterialCommunityIcons color="#052D64" name="arrow-right" size={18} />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 22, gap: 17, minHeight: 230, overflow: 'hidden', padding: 20 },
  artwork: { bottom: 0, left: 0, opacity: 0.8, position: 'absolute', right: 0, top: 0 },
  courtLine: { backgroundColor: '#CBFF4A', height: 2, opacity: 0.3, position: 'absolute', right: -20, top: 84, transform: [{ rotate: '-18deg' }], width: 190 },
  courtLineVertical: { backgroundColor: '#CBFF4A', height: 180, opacity: 0.22, position: 'absolute', right: 50, top: -10, transform: [{ rotate: '-18deg' }], width: 2 },
  icon: { opacity: 0.26, position: 'absolute', right: 12, top: 76, transform: [{ rotate: '-15deg' }] },
  copy: { gap: 7, maxWidth: '84%' },
  eyebrow: { color: '#CBFF4A', fontFamily: fonts.black, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#FFFFFF', fontFamily: fonts.black, fontSize: 27, fontWeight: '900', lineHeight: 31 },
  body: { color: 'rgba(255,255,255,0.8)', fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  button: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#CBFF4A', borderRadius: 99, flexDirection: 'row', gap: 7, marginTop: 'auto', paddingHorizontal: 15, paddingVertical: 11 },
  buttonText: { color: '#052D64', fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
});
