require("react-native-gesture-handler/jestSetup");

// Reanimated 4 delegates its native bits to the separate react-native-worklets package - its
// own testing guide says to mock that package's native module before touching Reanimated at
// all, then let Reanimated's own setUpTests() take over from there.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
require("react-native-reanimated").setUpTests();
