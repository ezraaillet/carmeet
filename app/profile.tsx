import { Text, View } from "react-native";

import profileStyles from "@/styles/profilestyles";

export default function ProfileScreen() {
  return (
    <View style={profileStyles.container}>
      <Text style={profileStyles.text}>Profile Page</Text>
    </View>
  );
}
