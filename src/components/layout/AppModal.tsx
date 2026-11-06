import { Modal as NativeModal, type ModalProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Native modals are outside the inset navigator and need their own safe view.
 * This consumes Router's provider; it does not install a nested provider. */
export function AppModal({ children, ...props }: ModalProps) {
  return <NativeModal {...props}><SafeAreaView style={{ flex: 1, backgroundColor: props.transparent ? "transparent" : "#06101D" }}>
    {children}
  </SafeAreaView></NativeModal>;
}
