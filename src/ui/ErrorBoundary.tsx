import { Component, Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';

interface ErrorBoundaryState {
  failed: boolean;
  attempt: number;
}

/**
 * Catches an unexpected error while drawing a screen, so the app shows a way back
 * instead of a blank screen. Notes are saved as they are typed, so nothing is lost.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('A screen could not be drawn.', error);
  }

  render(): ReactNode {
    if (!this.state.failed) {
      // A new key rebuilds the screens from scratch after "Try again".
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockTitle}>Something went wrong</Text>
        <Text style={styles.lockCopy}>Your notes are saved on this device. Try again, or close and reopen the app.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState((current) => ({ failed: false, attempt: current.attempt + 1 }))}
          style={({ pressed }) => [styles.primaryButton, styles.lockButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
