import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

interface Props {
  layer1: readonly [string, string, ...string[]];
  layer2: readonly [string, string, ...string[]];
  opacity2?: number;
}

export function PageBackground({ layer1, layer2, opacity2 = 0.55 }: Props) {
  return (
    <>
      <LinearGradient
        colors={layer1}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={layer2}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFillObject, { opacity: opacity2 }]}
      />
    </>
  );
}
