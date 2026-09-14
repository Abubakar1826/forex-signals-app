import React, { useState, useEffect } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";

const GOLD = "#D4AF37";
const FIRESTORE_PROJECT_ID = "forex-signals-800-pips";

const FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/signals`;

const USERS_FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/users`;

const EXPO_PUSH_URL =
  "https://exp.host/--/api/v2/push/send";


/* =========================
   REMOTE PUSH NOTIFICATION
========================= */

async function sendPushNotificationToEligibleUsers(
  title,
  body,
  data = {}
) {

  try {

    const response = await fetch(USERS_FIRESTORE_URL);

    if (!response.ok) {
      console.log("Users Firestore Error:", response.status);
      return;
    }

    const result = await response.json();
    const documents = result.documents || [];

    const tokens = documents
      .map((document) => {
        const fields = document.fields || {};
        const token = fields.expoPushToken?.stringValue || "";
        const enabled =
          fields.notificationEnabled?.booleanValue !== false;
        const userType =
          String(fields.userType?.stringValue || "TRIAL").toUpperCase();
        const trialStatus =
          String(fields.trialStatus?.stringValue || "ACTIVE").toUpperCase();
        const premiumStatus =
          String(fields.premiumStatus?.stringValue || "").toUpperCase();

        const eligible =
          enabled &&
          (userType === "TRIAL" ||
           userType === "PREMIUM" ||
           trialStatus === "ACTIVE" ||
           premiumStatus === "ACTIVE");

        return eligible &&
          token.startsWith("ExponentPushToken[")
          ? token
          : null;
      })
      .filter(Boolean);

    const uniqueTokens = [...new Set(tokens)];

    if (!uniqueTokens.length) {
      console.log("No eligible Expo push tokens found.");
      return;
    }

    for (let i = 0; i < uniqueTokens.length; i += 100) {

      const batch = uniqueTokens.slice(i, i + 100);

      const messages = batch.map((to) => ({
        to,
        sound: "default",
        title,
        body,
        priority: "high",
        channelId: "signals",
        data,
      }));

      const pushResponse = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const pushData = await pushResponse.json();

      console.log(
        "EXPO PUSH RESULT:",
        pushResponse.status,
        pushData
      );

      if (!pushResponse.ok) {
        console.log("Expo Push HTTP Error:", pushData);
      }
    }

  } catch (error) {
    console.log("Remote Push Error:", error);
  }
}


/* =========================
   FIRESTORE VALUE FUNCTION
========================= */

function getFirestoreValue(value) {

  if (!value) {
    return null;
  }

  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.integerValue !== undefined) {
    return Number(value.integerValue);
  }

  if (value.doubleValue !== undefined) {
    return Number(value.doubleValue);
  }

  if (value.booleanValue !== undefined) {
    return value.booleanValue;
  }

  if (value.timestampValue !== undefined) {
    return value.timestampValue;
  }

  if (value.nullValue !== undefined) {
    return null;
  }

  return null;

}


/* =========================
   FIRESTORE DOCUMENT PARSER
========================= */

function parseFirestoreSignal(document) {

  const fields = document.fields || {};

  const documentPath =
    document.name || "";

  const id =
    documentPath.split("/").pop();

  const status =
    String(
      getFirestoreValue(fields.Status) ||
      getFirestoreValue(fields.status) ||
      "OPEN"
    ).toUpperCase();

  return {

    id: id,

    pair:
      getFirestoreValue(fields.Pair) ||
      getFirestoreValue(fields.pair) ||
      "",

    type:
      String(
        getFirestoreValue(fields.type) ||
        getFirestoreValue(fields.Type) ||
        "BUY"
      ).toUpperCase(),

    entry:
      String(
        getFirestoreValue(fields.Entry) ||
        getFirestoreValue(fields.entry) ||
        ""
      ),

    started:
      getFirestoreValue(fields.StartedAt) ||
      getFirestoreValue(fields.startedAt) ||
      getFirestoreValue(fields.started) ||
      "",

    status: status,

    closedPrice:
      String(
        getFirestoreValue(fields.ClosedPrice) ||
        getFirestoreValue(fields.closedPrice) ||
        ""
      ),

    closedAt:
      getFirestoreValue(fields.ClosedAt) ||
      getFirestoreValue(fields.closedAt) ||
      "",

    pips:
      Number(
        getFirestoreValue(fields.Pips) ||
        getFirestoreValue(fields.pips) ||
        0
      ),

  };

}


/* =========================
   DATE FUNCTION
========================= */

function getCurrentDateTime() {
  return new Date().toLocaleString();
}


/* =========================
   STAT CARD
========================= */

function StatCard({ icon, title, value }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTopRow}>
        <Text style={styles.statIcon}>{icon}</Text>

        <Text style={styles.statValue}>{value}</Text>
      </View>

      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}


/* =========================
   BACK BUTTON
========================= */

function BackButton({ setActivePage }) {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={() => setActivePage("DASHBOARD")}
    >
      <Text style={styles.backButtonText}>
        ← BACK TO DASHBOARD
      </Text>
    </TouchableOpacity>
  );
}


/* =========================
   DASHBOARD
========================= */

function Dashboard({
  setActivePage,
  activeSignals,
  closedSignals,
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.welcomeText}>
        ADMIN DASHBOARD
      </Text>

      <Text style={styles.subText}>
        FOREX SIGNALS 800 PIPS MANAGEMENT
      </Text>

      <View style={styles.statsGrid}>
        <StatCard
          icon="👥"
          title="TOTAL USERS"
          value="125"
        />

        <StatCard
          icon="🆓"
          title="ACTIVE TRIALS"
          value="40"
        />

        <StatCard
          icon="⏰"
          title="EXPIRED"
          value="60"
        />

        <StatCard
          icon="💎"
          title="PREMIUM"
          value="25"
        />

        <StatCard
          icon="🟢"
          title="ACTIVE SIGNALS"
          value={activeSignals.length}
        />

        <StatCard
          icon="📜"
          title="CLOSED SIGNALS"
          value={closedSignals.length}
        />
      </View>

      <Text style={styles.sectionTitle}>
        QUICK ACTIONS
      </Text>

      <TouchableOpacity
        style={styles.quickButton}
        onPress={() => setActivePage("ADD")}
      >
        <Text style={styles.quickButtonText}>
          ➕ ADD NEW SIGNAL
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quickButton}
        onPress={() => setActivePage("ACTIVE")}
      >
        <Text style={styles.quickButtonText}>
          🟢 MANAGE ACTIVE SIGNALS
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.quickButton}
        onPress={() => setActivePage("CLOSED")}
      >
        <Text style={styles.quickButtonText}>
          📜 MANAGE CLOSED SIGNALS
        </Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}


/* =========================
   ADD SIGNAL
========================= */

function AddSignal({
  setActivePage,
  addSignal,
}) {
  const [pair, setPair] = useState("");
  const [entry, setEntry] = useState("");
  const [signalType, setSignalType] =
    useState("BUY");

  async function saveSignal() {
    if (!pair.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter Currency Pair / Symbol."
      );
      return;
    }

    if (!entry.trim()) {
      Alert.alert(
        "Missing Information",
        "Please enter Entry Price."
      );
      return;
    }

    await addSignal(
      pair.trim().toUpperCase(),
      signalType,
      entry.trim()
    );

    Alert.alert(
      "SUCCESS",
      "Signal added successfully."
    );

    setPair("");
    setEntry("");
    setSignalType("BUY");

    setActivePage("ACTIVE");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
      >
        <BackButton
          setActivePage={setActivePage}
        />

        <Text style={styles.pageHeading}>
          ADD NEW SIGNAL
        </Text>

        <View style={styles.formCard}>
          <Text style={styles.inputLabel}>
            CURRENCY PAIR / SYMBOL
          </Text>

          <TextInput
            value={pair}
            onChangeText={setPair}
            placeholder="Example: EUR/USD"
            placeholderTextColor="#666"
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Text style={styles.inputLabel}>
            SIGNAL TYPE
          </Text>

          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                signalType === "BUY" &&
                  styles.buySelected,
              ]}
              onPress={() => setSignalType("BUY")}
            >
              <Text style={styles.typeButtonText}>
                BUY
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeButton,
                signalType === "SELL" &&
                  styles.sellSelected,
              ]}
              onPress={() => setSignalType("SELL")}
            >
              <Text style={styles.typeButtonText}>
                SELL
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>
            ENTRY PRICE
          </Text>

          <TextInput
            value={entry}
            onChangeText={setEntry}
            placeholder="Example: 1.1560"
            placeholderTextColor="#666"
            style={styles.input}
            keyboardType="decimal-pad"
          />

          <Text style={styles.inputLabel}>
            SIGNAL START DATE & TIME
          </Text>

          <View style={styles.datePreview}>
            <Text style={styles.dateText}>
              Automatic Date & Time
            </Text>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSignal}
          >
            <Text style={styles.saveButtonText}>
              SAVE SIGNAL
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.infoNote}>
          Signal will be automatically added to Active Signals.
        </Text>

        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


/* =========================
   ACTIVE SIGNALS
========================= */

function ActiveSignals({
  setActivePage,
  activeSignals,
  onCloseSignal,
  onEditSignal,
  onDeleteSignal,
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <BackButton
        setActivePage={setActivePage}
      />

      <Text style={styles.pageHeading}>
        ACTIVE SIGNALS
      </Text>

      <Text style={styles.pageDescription}>
        Manage currently open trading signals.
      </Text>

      {activeSignals.length === 0 && (
        <Text style={styles.emptyText}>
          NO ACTIVE SIGNALS
        </Text>
      )}

      {activeSignals.map((signal) => (
        <View
          key={signal.id}
          style={styles.signalCard}
        >
          <View style={styles.signalHeader}>
            <Text style={styles.pair}>
              {signal.pair}
            </Text>

            <Text
              style={
                signal.type === "BUY"
                  ? styles.buy
                  : styles.sell
              }
            >
              {signal.type}
            </Text>
          </View>

          <Text style={styles.detail}>
            Entry:{" "}
            <Text style={styles.white}>
              {signal.entry}
            </Text>
          </Text>

          <Text style={styles.detail}>
            Started:{" "}
            <Text style={styles.white}>
              {signal.started}
            </Text>
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => onEditSignal(signal)}
            >
              <Text style={styles.actionText}>
                ✏ EDIT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => onCloseSignal(signal)}
            >
              <Text style={styles.actionText}>
                🔒 CLOSE
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDeleteSignal(signal)}
            >
              <Text style={styles.actionText}>
                🗑 DELETE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}


/* =========================
   CLOSED SIGNALS
========================= */

function ClosedSignals({
  setActivePage,
  closedSignals,
  onEditClosedSignal,
  onDeleteClosedSignal,
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <BackButton
        setActivePage={setActivePage}
      />

      <Text style={styles.pageHeading}>
        CLOSED SIGNALS
      </Text>

      <Text style={styles.pageDescription}>
        Edit or delete completed signals.
      </Text>

      {closedSignals.length === 0 && (
        <Text style={styles.emptyText}>
          NO CLOSED SIGNALS
        </Text>
      )}

      {closedSignals.map((signal) => (
        <View
          key={signal.id}
          style={styles.signalCard}
        >
          <View style={styles.signalHeader}>
            <Text style={styles.pair}>
              {signal.pair}
            </Text>

            <Text
              style={
                signal.type === "BUY"
                  ? styles.buy
                  : styles.sell
              }
            >
              {signal.type}
            </Text>
          </View>

          <Text style={styles.detail}>
            Entry:{" "}
            <Text style={styles.white}>
              {signal.entry}
            </Text>
          </Text>

          <Text style={styles.detail}>
            Closed Price:{" "}
            <Text style={styles.white}>
              {signal.closedPrice}
            </Text>
          </Text>

          <Text style={styles.detail}>
            Closed:{" "}
            <Text style={styles.white}>
              {signal.closedAt || "N/A"}
            </Text>
          </Text>

          <Text style={styles.detail}>
            Result:{" "}

            <Text
              style={
                signal.pips >= 0
                  ? styles.profit
                  : styles.loss
              }
            >
              {signal.pips >= 0 ? "+" : ""}
              {signal.pips} PIPS
            </Text>
          </Text>

          <View style={styles.closedActionRow}>
            <TouchableOpacity
              style={styles.editLargeButton}
              onPress={() =>
                onEditClosedSignal(signal)
              }
            >
              <Text style={styles.actionText}>
                ✏ EDIT SIGNAL
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteLargeButton}
              onPress={() =>
                onDeleteClosedSignal(signal)
              }
            >
              <Text style={styles.actionText}>
                🗑 DELETE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}


/* =========================
   NAV BUTTON
========================= */

function NavButton({
  icon,
  title,
  page,
  activePage,
  setActivePage,
}) {
  const active = activePage === page;

  return (
    <TouchableOpacity
      style={styles.navButton}
      activeOpacity={0.6}
      onPress={() => setActivePage(page)}
    >
      <Text
        style={[
          styles.navIcon,
          active && styles.navActive,
        ]}
      >
        {icon}
      </Text>

      <Text
        style={[
          styles.navText,
          active && styles.navActive,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}


/* =========================
   MAIN APP
========================= */

export default function App() {

  const [activePage, setActivePage] =
    useState("DASHBOARD");


  const [activeSignals, setActiveSignals] =
    useState([
      {
        id: "1",
        pair: "EUR/USD",
        type: "BUY",
        entry: "1.1560",
        started: "05 Sep 2026, 08:30 AM",
      },

      {
        id: "2",
        pair: "GBP/USD",
        type: "SELL",
        entry: "1.3480",
        started: "04 Sep 2026, 11:15 AM",
      },
    ]);


  const [closedSignals, setClosedSignals] =
    useState([
      {
        id: "3",
        pair: "EUR/USD",
        type: "BUY",
        entry: "1.1560",
        closedPrice: "1.1590",
        pips: 30,
        closedAt: "05 Sep 2026",
      },

      {
        id: "4",
        pair: "GBP/USD",
        type: "SELL",
        entry: "1.3650",
        closedPrice: "1.3670",
        pips: -20,
        closedAt: "04 Sep 2026",
      },

      {
        id: "5",
        pair: "GOLD",
        type: "BUY",
        entry: "2850",
        closedPrice: "2930",
        pips: 80,
        closedAt: "03 Sep 2026",
      },
    ]);
      const [firebaseLoading, setFirebaseLoading] =
    useState(true);


  useEffect(() => {

    async function loadFirestoreSignals() {

      try {

        setFirebaseLoading(true);

        const response =
          await fetch(FIRESTORE_URL);

        const data =
          await response.json();


        if (!response.ok) {

          console.log(
            "Firestore Error:",
            data
          );

          return;

        }


        const documents =
          data.documents || [];


        const signals =
          documents.map(
            parseFirestoreSignal
          );


        const openSignals =
          signals.filter(
            (signal) =>
              signal.status === "OPEN"
          );


        const closedSignalsFromFirebase =
          signals.filter(
            (signal) =>
              signal.status === "CLOSED"
          );


        setActiveSignals(openSignals);

        setClosedSignals(
          closedSignalsFromFirebase
        );


        console.log(
          "FIREBASE CONNECTED SUCCESSFULLY"
        );


      } catch (error) {

        console.log(
          "FIREBASE CONNECTION ERROR:",
          error
        );

      } finally {

        setFirebaseLoading(false);

      }

    }


    loadFirestoreSignals();

  }, []);


  /* =========================
     CLOSE SIGNAL MODAL
  ========================= */

  const [closeModalVisible,
    setCloseModalVisible] = useState(false);

  const [selectedSignal,
    setSelectedSignal] = useState(null);

  const [closePrice,
    setClosePrice] = useState("");


  /* =========================
     EDIT ACTIVE MODAL
  ========================= */

  const [editActiveVisible,
    setEditActiveVisible] = useState(false);

  const [editActiveSignal,
    setEditActiveSignal] = useState(null);

  const [editActivePair,
    setEditActivePair] = useState("");

  const [editActiveEntry,
    setEditActiveEntry] = useState("");

  const [editActiveType,
    setEditActiveType] = useState("BUY");


  /* =========================
     EDIT CLOSED MODAL
  ========================= */

  const [editClosedVisible,
    setEditClosedVisible] = useState(false);

  const [editClosedSignal,
    setEditClosedSignal] = useState(null);

  const [editClosedPair,
    setEditClosedPair] = useState("");

  const [editClosedEntry,
    setEditClosedEntry] = useState("");

  const [editClosedPrice,
    setEditClosedPrice] = useState("");

  const [editClosedType,
    setEditClosedType] = useState("BUY");


  /* =========================
     ADD SIGNAL FUNCTION
  ========================= */

  async function addSignal(pair, type, entry) {
  const newSignal = {
    id: Date.now().toString(),
    pair: pair,
    type: type,
    entry: entry,
    started: getCurrentDateTime(),
    status: "OPEN",
  };

  try {
    const response = await fetch(FIRESTORE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          id: {
            stringValue: newSignal.id,
          },
          pair: {
            stringValue: newSignal.pair,
          },
          type: {
            stringValue: newSignal.type,
          },
          entry: {
            stringValue: newSignal.entry,
          },
          started: {
            stringValue: newSignal.started,
          },
          status: {
            stringValue: newSignal.status,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save signal");
    }

    setActiveSignals((previousSignals) => [
      newSignal,
      ...previousSignals,
    ]);

    await sendPushNotificationToEligibleUsers(
      "🔔 NEW SIGNAL — FOREX SIGNALS 800 PIPS",
      `${newSignal.pair} ${newSignal.type} @ ${newSignal.entry}`,
      {
        type: "NEW_SIGNAL",
        signalId: newSignal.id,
        pair: newSignal.pair,
        direction: newSignal.type,
        entry: newSignal.entry,
      }
    );

  } catch (error) {
    console.log("Firebase Save Error:", error);
    Alert.alert(
      "ERROR",
      "Signal Firebase mein save nahi hua."
    );
  }
}


  /* =========================
     OPEN CLOSE MODAL
  ========================= */

  function openCloseModal(signal) {

    setSelectedSignal(signal);
    setClosePrice("");
    setCloseModalVisible(true);

  }


  /* =========================
     PIPS CALCULATION
  ========================= */

  function calculatePips(
    pair,
    type,
    entry,
    close
  ) {

    const entryNumber =
      parseFloat(entry);

    const closeNumber =
      parseFloat(close);

    if (
      isNaN(entryNumber) ||
      isNaN(closeNumber)
    ) {
      return 0;
    }


    /*
      GOLD / XAU calculation
    */

    if (
      pair.toUpperCase().includes("GOLD") ||
      pair.toUpperCase().includes("XAU")
    ) {

      let difference =
        closeNumber - entryNumber;

      if (type === "SELL") {
        difference = -difference;
      }

      return Math.round(difference);

    }


    /*
      JPY PAIRS
    */

    if (
      pair.toUpperCase().includes("JPY")
    ) {

      let difference =
        (closeNumber - entryNumber) * 100;

      if (type === "SELL") {
        difference = -difference;
      }

      return Math.round(difference);

    }


    /*
      NORMAL FOREX PAIRS
    */

    let difference =
      (closeNumber - entryNumber) * 10000;

    if (type === "SELL") {
      difference = -difference;
    }

    return Math.round(difference);

  }


  /* =========================
     CONFIRM CLOSE SIGNAL
  ========================= */

  async function confirmCloseSignal() {

  if (!closePrice.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Closed Price."
    );

    return;
  }


  if (!selectedSignal) {
    return;
  }


  const pips =
    calculatePips(
      selectedSignal.pair,
      selectedSignal.type,
      selectedSignal.entry,
      closePrice
    );


  const closedAt =
    getCurrentDateTime();


  try {

    const response =
      await fetch(
        `${FIRESTORE_URL}/${selectedSignal.id}`,
        {

          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({

            fields: {

              id: {
                stringValue:
                  String(selectedSignal.id),
              },

              pair: {
                stringValue:
                  String(selectedSignal.pair),
              },

              type: {
                stringValue:
                  String(selectedSignal.type),
              },

              entry: {
                stringValue:
                  String(selectedSignal.entry),
              },

              started: {
                stringValue:
                  String(selectedSignal.started),
              },

              status: {
                stringValue:
                  "CLOSED",
              },

              closedPrice: {
                stringValue:
                  closePrice.trim(),
              },

              closedAt: {
                stringValue:
                  closedAt,
              },

              pips: {
                integerValue:
                  String(pips),
              },

            },

          }),

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      console.log(
        "FIREBASE CLOSE ERROR:",
        data
      );

      Alert.alert(
        "ERROR",
        "Signal Firebase mein close nahi hua."
      );

      return;
    }


    const closedSignal = {

      ...selectedSignal,

      status: "CLOSED",

      closedPrice:
        closePrice.trim(),

      pips: pips,

      closedAt: closedAt,

    };


    setActiveSignals(
      (previousSignals) =>
        previousSignals.filter(
          (signal) =>
            signal.id !== selectedSignal.id
        )
    );


    setClosedSignals(
      (previousSignals) => [
        closedSignal,
        ...previousSignals,
      ]
    );


    setCloseModalVisible(false);

    setSelectedSignal(null);

    setClosePrice("");


    await sendPushNotificationToEligibleUsers(
      "🔔 SIGNAL CLOSED — FOREX SIGNALS 800 PIPS",
      `${closedSignal.pair} @ ${closedSignal.closedPrice}`,
      {
        type: "CLOSED_SIGNAL",
        signalId: closedSignal.id,
        pair: closedSignal.pair,
        direction: closedSignal.type,
        closedPrice: closedSignal.closedPrice,
      }
    );


    Alert.alert(
      "SUCCESS",
      "Signal closed successfully."
    );


  } catch (error) {

    console.log(
      "FIREBASE CLOSE ERROR:",
      error
    );

    Alert.alert(
      "ERROR",
      "Firebase connection failed."
    );

  }

}


  /* =========================
     EDIT ACTIVE SIGNAL
  ========================= */

  function openEditActive(signal) {

    setEditActiveSignal(signal);

    setEditActivePair(signal.pair);

    setEditActiveEntry(signal.entry);

    setEditActiveType(signal.type);

    setEditActiveVisible(true);

  }


  async function saveEditActive() {

  if (!editActiveSignal) {
    return;
  }

  if (!editActivePair.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Currency Pair / Symbol."
    );

    return;

  }

  if (!editActiveEntry.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Entry Price."
    );

    return;

  }

  const updatedPair =
    editActivePair
      .trim()
      .toUpperCase();

  const updatedEntry =
    editActiveEntry.trim();

  try {

    const response =
      await fetch(
        `${FIRESTORE_URL}/${editActiveSignal.id}`,
        {

          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({

            fields: {

              id: {
                stringValue:
                  String(editActiveSignal.id),
              },

              pair: {
                stringValue:
                  updatedPair,
              },

              type: {
                stringValue:
                  String(editActiveType),
              },

              entry: {
                stringValue:
                  updatedEntry,
              },

              started: {
                stringValue:
                  String(editActiveSignal.started),
              },

              status: {
                stringValue:
                  "OPEN",
              },

            },

          }),

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      console.log(
        "FIREBASE EDIT ERROR:",
        data
      );

      Alert.alert(
        "ERROR",
        "Signal Firebase mein update nahi hua."
      );

      return;

    }

    setActiveSignals(
      (previousSignals) =>
        previousSignals.map(
          (signal) =>

            signal.id ===
            editActiveSignal.id

              ? {
                  ...signal,

                  pair: updatedPair,

                  entry: updatedEntry,

                  type: editActiveType,

                }

              : signal
        )
    );

    setEditActiveVisible(false);

    setEditActiveSignal(null);

    Alert.alert(
      "SUCCESS",
      "Active signal updated successfully."
    );

  } catch (error) {

    console.log(
      "FIREBASE EDIT ERROR:",
      error
    );

    Alert.alert(
      "ERROR",
      "Firebase connection failed."
    );

  }

}


  /* =========================
     DELETE ACTIVE SIGNAL
  ========================= */

  function deleteActiveSignal(signal) {

  Alert.alert(
    "DELETE SIGNAL",
    `Are you sure you want to delete ${signal.pair}?`,
    [
      {
        text: "CANCEL",
        style: "cancel",
      },

      {
        text: "DELETE",
        style: "destructive",

        onPress: async () => {

          try {

            console.log(
              "DELETING DOCUMENT ID:",
              signal.id
            );

            const response =
              await fetch(
                `${FIRESTORE_URL}/${encodeURIComponent(signal.id)}`,
                {
                  method: "DELETE",
                }
              );

            console.log(
              "DELETE STATUS:",
              response.status
            );

            if (!response.ok) {

              const errorText =
                await response.text();

              console.log(
                "FIREBASE DELETE ERROR:",
                errorText
              );

              Alert.alert(
                "ERROR",
                `Delete failed. Status: ${response.status}`
              );

              return;
            }

            setActiveSignals(
              (previousSignals) =>
                previousSignals.filter(
                  (item) =>
                    item.id !== signal.id
                )
            );

            Alert.alert(
              "SUCCESS",
              "Active signal deleted successfully."
            );

          } catch (error) {

            console.log(
              "FIREBASE DELETE ERROR:",
              error
            );

            Alert.alert(
              "ERROR",
              "Firebase connection failed."
            );

          }

        },
      },
    ]
  );

}


  /* =========================
     EDIT CLOSED SIGNAL
  ========================= */

  function openEditClosed(signal) {

    setEditClosedSignal(signal);

    setEditClosedPair(signal.pair);

    setEditClosedEntry(signal.entry);

    setEditClosedPrice(signal.closedPrice);

    setEditClosedType(signal.type);

    setEditClosedVisible(true);

  }


  async function saveEditClosed() {

  if (!editClosedSignal) {
    return;
  }

  if (!editClosedPair.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Currency Pair / Symbol."
    );

    return;

  }

  if (!editClosedEntry.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Entry Price."
    );

    return;

  }

  if (!editClosedPrice.trim()) {

    Alert.alert(
      "Missing Information",
      "Please enter Closed Price."
    );

    return;

  }

  const newPair =
    editClosedPair
      .trim()
      .toUpperCase();

  const newEntry =
    editClosedEntry.trim();

  const newClosedPrice =
    editClosedPrice.trim();

  const newPips =
    calculatePips(
      newPair,
      editClosedType,
      newEntry,
      newClosedPrice
    );

  try {

    const response =
      await fetch(
        `${FIRESTORE_URL}/${editClosedSignal.id}`,
        {

          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({

            fields: {

              id: {
                stringValue:
                  String(editClosedSignal.id),
              },

              pair: {
                stringValue:
                  newPair,
              },

              type: {
                stringValue:
                  String(editClosedType),
              },

              entry: {
                stringValue:
                  newEntry,
              },

              started: {
                stringValue:
                  String(editClosedSignal.started),
              },

              status: {
                stringValue:
                  "CLOSED",
              },

              closedPrice: {
                stringValue:
                  newClosedPrice,
              },

              closedAt: {
                stringValue:
                  String(editClosedSignal.closedAt),
              },

              pips: {
                integerValue:
                  String(newPips),
              },

            },

          }),

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      console.log(
        "FIREBASE CLOSED EDIT ERROR:",
        data
      );

      Alert.alert(
        "ERROR",
        "Closed signal Firebase mein update nahi hua."
      );

      return;

    }

    setClosedSignals(
      (previousSignals) =>
        previousSignals.map(
          (signal) =>

            signal.id ===
            editClosedSignal.id

              ? {

                  ...signal,

                  pair: newPair,

                  entry: newEntry,

                  closedPrice: newClosedPrice,

                  type: editClosedType,

                  pips: newPips,

                }

              : signal
        )
    );

    setEditClosedVisible(false);

    setEditClosedSignal(null);

    Alert.alert(
      "SUCCESS",
      "Closed signal updated successfully."
    );

  } catch (error) {

    console.log(
      "FIREBASE CLOSED EDIT ERROR:",
      error
    );

    Alert.alert(
      "ERROR",
      "Firebase connection failed."
    );

  }

}
function deleteClosedSignal(signal) {

  Alert.alert(
    "DELETE CLOSED SIGNAL",
    `Are you sure you want to delete ${signal.pair}?`,
    [
      {
        text: "CANCEL",
        style: "cancel",
      },

      {
        text: "DELETE",
        style: "destructive",

        onPress: async () => {

          try {

            console.log(
              "DELETING CLOSED DOCUMENT ID:",
              signal.id
            );

            const response =
              await fetch(
                `${FIRESTORE_URL}/${encodeURIComponent(signal.id)}`,
                {
                  method: "DELETE",
                }
              );

            console.log(
              "DELETE STATUS:",
              response.status
            );

            if (!response.ok) {

              const errorText =
                await response.text();

              console.log(
                "FIREBASE DELETE ERROR:",
                errorText
              );

              Alert.alert(
                "ERROR",
                `Delete failed. Status: ${response.status}`
              );

              return;
            }

            setClosedSignals(
              (previousSignals) =>
                previousSignals.filter(
                  (item) =>
                    item.id !== signal.id
                )
            );

            Alert.alert(
              "SUCCESS",
              "Closed signal deleted successfully."
            );

          } catch (error) {

            console.log(
              "FIREBASE DELETE ERROR:",
              error
            );

            Alert.alert(
              "ERROR",
              "Firebase connection failed."
            );

          }

        },
      },
    ]
  );

}

  /* =========================
     RENDER PAGE
  ========================= */

  function renderPage() {

    if (
      activePage === "DASHBOARD"
    ) {

      return (

        <Dashboard
          setActivePage={setActivePage}
          activeSignals={activeSignals}
          closedSignals={closedSignals}
        />

      );

    }


    if (
      activePage === "ADD"
    ) {

      return (

        <AddSignal
          setActivePage={setActivePage}
          addSignal={addSignal}
        />

      );

    }


    if (
      activePage === "ACTIVE"
    ) {

      return (

        <ActiveSignals

          setActivePage={setActivePage}

          activeSignals={activeSignals}

          onCloseSignal={
            openCloseModal
          }

          onEditSignal={
            openEditActive
          }

          onDeleteSignal={
            deleteActiveSignal
          }

        />

      );

    }


    if (
      activePage === "CLOSED"
    ) {

      return (

        <ClosedSignals

          setActivePage={setActivePage}

          closedSignals={closedSignals}

          onEditClosedSignal={
            openEditClosed
          }

          onDeleteClosedSignal={
            deleteClosedSignal
          }

        />

      );

    }


    return (

      <Dashboard
        setActivePage={setActivePage}
        activeSignals={activeSignals}
        closedSignals={closedSignals}
      />

    );

  }


  return (

    <SafeAreaView
      style={styles.container}
    >

      {/* HEADER */}

      <View style={styles.header}>

        <View>

          <Text style={styles.mainTitle}>
            FOREX SIGNALS 800 PIPS
          </Text>

          <Text style={styles.adminTitle}>
            ADMIN PANEL
          </Text>

        </View>


        <View style={styles.adminBadge}>

          <Text
            style={styles.adminBadgeText}
          >
            ADMIN
          </Text>

        </View>

      </View>


      {/* PAGE */}

      <View style={styles.pageContainer}>

        {renderPage()}

      </View>


      {/* BOTTOM NAVIGATION */}

      <View style={styles.bottomNav}>

        <NavButton
          icon="▣"
          title="Dashboard"
          page="DASHBOARD"
          activePage={activePage}
          setActivePage={setActivePage}
        />


        <NavButton
          icon="＋"
          title="Add Signal"
          page="ADD"
          activePage={activePage}
          setActivePage={setActivePage}
        />


        <NavButton
          icon="●"
          title="Active"
          page="ACTIVE"
          activePage={activePage}
          setActivePage={setActivePage}
        />


        <NavButton
          icon="■"
          title="Closed"
          page="CLOSED"
          activePage={activePage}
          setActivePage={setActivePage}
        />

      </View>


      {/* =====================
          CLOSE SIGNAL MODAL
      ===================== */}

      <Modal
        visible={closeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setCloseModalVisible(false)
        }
      >

        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >

          <View style={styles.modalCard}>

            <Text style={styles.modalTitle}>
              CLOSE SIGNAL
            </Text>


            {selectedSignal && (

              <Text
                style={styles.modalSignalText}
              >
                {selectedSignal.pair} •{" "}
                {selectedSignal.type}
              </Text>

            )}


            <Text
              style={styles.inputLabel}
            >
              CLOSED PRICE
            </Text>


            <TextInput
              value={closePrice}
              onChangeText={setClosePrice}
              placeholder="Enter Closed Price"
              placeholderTextColor="#666"
              style={styles.input}
              keyboardType="decimal-pad"
            />


            <View style={styles.modalButtons}>

              <TouchableOpacity

                style={
                  styles.modalCancelButton
                }

                onPress={() => {

                  setCloseModalVisible(false);

                  setClosePrice("");

                  setSelectedSignal(null);

                }}

              >

                <Text
                  style={styles.actionText}
                >
                  CANCEL
                </Text>

              </TouchableOpacity>


              <TouchableOpacity

                style={
                  styles.modalConfirmButton
                }

                onPress={
                  confirmCloseSignal
                }

              >

                <Text
                  style={
                    styles.modalConfirmText
                  }
                >
                  CLOSE SIGNAL
                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </KeyboardAvoidingView>

      </Modal>


      {/* =====================
          EDIT ACTIVE MODAL
      ===================== */}

      <Modal
        visible={editActiveVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setEditActiveVisible(false)
        }
      >

        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >

          <ScrollView
            contentContainerStyle={
              styles.modalScroll
            }
            keyboardShouldPersistTaps="always"
          >

            <View style={styles.modalCard}>

              <Text style={styles.modalTitle}>
                EDIT ACTIVE SIGNAL
              </Text>


              <Text
                style={styles.inputLabel}
              >
                CURRENCY PAIR / SYMBOL
              </Text>


              <TextInput
                value={editActivePair}
                onChangeText={
                  setEditActivePair
                }
                placeholder="EUR/USD"
                placeholderTextColor="#666"
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
              />


              <Text
                style={styles.inputLabel}
              >
                SIGNAL TYPE
              </Text>


              <View style={styles.typeRow}>

                <TouchableOpacity

                  style={[

                    styles.typeButton,

                    editActiveType === "BUY" &&
                      styles.buySelected,

                  ]}

                  onPress={() =>
                    setEditActiveType("BUY")
                  }

                >

                  <Text
                    style={styles.typeButtonText}
                  >
                    BUY
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity

                  style={[

                    styles.typeButton,

                    editActiveType === "SELL" &&
                      styles.sellSelected,

                  ]}

                  onPress={() =>
                    setEditActiveType("SELL")
                  }

                >

                  <Text
                    style={styles.typeButtonText}
                  >
                    SELL
                  </Text>

                </TouchableOpacity>

              </View>


              <Text
                style={styles.inputLabel}
              >
                ENTRY PRICE
              </Text>


              <TextInput
                value={editActiveEntry}
                onChangeText={
                  setEditActiveEntry
                }
                placeholder="Entry Price"
                placeholderTextColor="#666"
                style={styles.input}
                keyboardType="decimal-pad"
              />


              <View style={styles.modalButtons}>

                <TouchableOpacity

                  style={
                    styles.modalCancelButton
                  }

                  onPress={() => {

                    setEditActiveVisible(false);

                    setEditActiveSignal(null);

                  }}

                >

                  <Text
                    style={styles.actionText}
                  >
                    CANCEL
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity

                  style={
                    styles.modalConfirmButton
                  }

                  onPress={
                    saveEditActive
                  }

                >

                  <Text
                    style={
                      styles.modalConfirmText
                    }
                  >
                    SAVE CHANGES
                  </Text>

                </TouchableOpacity>

              </View>

            </View>

          </ScrollView>

        </KeyboardAvoidingView>

      </Modal>


      {/* =====================
          EDIT CLOSED MODAL
      ===================== */}

      <Modal
        visible={editClosedVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setEditClosedVisible(false)
        }
      >

        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={
            Platform.OS === "ios"
              ? "padding"
              : undefined
          }
        >

          <ScrollView
            contentContainerStyle={
              styles.modalScroll
            }
            keyboardShouldPersistTaps="always"
          >

            <View style={styles.modalCard}>

              <Text style={styles.modalTitle}>
                EDIT CLOSED SIGNAL
              </Text>


              <Text
                style={styles.inputLabel}
              >
                CURRENCY PAIR / SYMBOL
              </Text>


              <TextInput
                value={editClosedPair}
                onChangeText={
                  setEditClosedPair
                }
                placeholder="EUR/USD"
                placeholderTextColor="#666"
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
              />


              <Text
                style={styles.inputLabel}
              >
                SIGNAL TYPE
              </Text>


              <View style={styles.typeRow}>

                <TouchableOpacity

                  style={[

                    styles.typeButton,

                    editClosedType === "BUY" &&
                      styles.buySelected,

                  ]}

                  onPress={() =>
                    setEditClosedType("BUY")
                  }

                >

                  <Text
                    style={styles.typeButtonText}
                  >
                    BUY
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity

                  style={[

                    styles.typeButton,

                    editClosedType === "SELL" &&
                      styles.sellSelected,

                  ]}

                  onPress={() =>
                    setEditClosedType("SELL")
                  }

                >

                  <Text
                    style={styles.typeButtonText}
                  >
                    SELL
                  </Text>

                </TouchableOpacity>

              </View>


              <Text
                style={styles.inputLabel}
              >
                ENTRY PRICE
              </Text>


              <TextInput
                value={editClosedEntry}
                onChangeText={
                  setEditClosedEntry
                }
                placeholder="Entry Price"
                placeholderTextColor="#666"
                style={styles.input}
                keyboardType="decimal-pad"
              />


              <Text
                style={styles.inputLabel}
              >
                CLOSED PRICE
              </Text>


              <TextInput
                value={editClosedPrice}
                onChangeText={
                  setEditClosedPrice
                }
                placeholder="Closed Price"
                placeholderTextColor="#666"
                style={styles.input}
                keyboardType="decimal-pad"
              />


              <Text style={styles.infoNote}>
                Pips will automatically recalculate.
              </Text>


              <View style={styles.modalButtons}>

                <TouchableOpacity

                  style={
                    styles.modalCancelButton
                  }

                  onPress={() => {

                    setEditClosedVisible(false);

                    setEditClosedSignal(null);

                  }}

                >

                  <Text
                    style={styles.actionText}
                  >
                    CANCEL
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity

                  style={
                    styles.modalConfirmButton
                  }

                  onPress={
                    saveEditClosed
                  }

                >

                  <Text
                    style={
                      styles.modalConfirmText
                    }
                  >
                    SAVE CHANGES
                  </Text>

                </TouchableOpacity>

              </View>

            </View>

          </ScrollView>

        </KeyboardAvoidingView>

      </Modal>

    </SafeAreaView>

  );

}


/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#080808",
  },


  header: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#292929",
  },


  mainTitle: {
    color: GOLD,
    fontSize: 17,
    fontWeight: "bold",
  },


  adminTitle: {
    color: "#888888",
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 3,
    letterSpacing: 2,
  },


  adminBadge: {
    backgroundColor: "#8C6B16",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },


  adminBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },


  pageContainer: {
    flex: 1,
  },


  content: {
    padding: 12,
  },


  welcomeText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
  },


  subText: {
    color: "#888888",
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 15,
  },


  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },


  statCard: {
    width: "48%",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#262626",
  },


  statTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },


  statIcon: {
    fontSize: 19,
  },


  statValue: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "bold",
  },


  statTitle: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 3,
    textAlign: "center",
  },


  sectionTitle: {
    color: GOLD,
    fontSize: 15,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 8,
  },


  quickButton: {
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#333333",
    borderRadius: 9,
    padding: 14,
    marginBottom: 8,
  },


  quickButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },


  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1B1B1B",
    borderWidth: 1,
    borderColor: "#383838",
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 8,
  },


  backButtonText: {
    color: GOLD,
    fontSize: 10,
    fontWeight: "bold",
  },


  pageHeading: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
  },


  pageDescription: {
    color: "#888888",
    fontSize: 12,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 8,
  },


  formCard: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 15,
    marginTop: 15,
  },


  inputLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 7,
  },


  input: {
    backgroundColor: "#101010",
    borderWidth: 1,
    borderColor: "#353535",
    borderRadius: 8,
    color: "#FFFFFF",
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
  },


  typeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },


  typeButton: {
    width: "48%",
    backgroundColor: "#242424",
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 8,
  },


  buySelected: {
    backgroundColor: "#287A38",
  },


  sellSelected: {
    backgroundColor: "#8A3030",
  },


  typeButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },


  datePreview: {
    backgroundColor: "#101010",
    borderWidth: 1,
    borderColor: "#353535",
    padding: 14,
    borderRadius: 8,
  },


  dateText: {
    color: "#888888",
    fontSize: 13,
  },


  saveButton: {
    backgroundColor: GOLD,
    paddingVertical: 15,
    borderRadius: 9,
    alignItems: "center",
    marginTop: 25,
  },


  saveButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 15,
  },


  infoNote: {
    color: "#777777",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 14,
    paddingHorizontal: 15,
  },


  signalCard: {
    backgroundColor: "#171717",
    borderRadius: 10,
    padding: 13,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#292929",
  },


  signalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },


  pair: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },


  buy: {
    color: "#72E572",
    fontSize: 15,
    fontWeight: "bold",
  },


  sell: {
    color: "#FF6868",
    fontSize: 15,
    fontWeight: "bold",
  },


  detail: {
    color: "#999999",
    fontSize: 13,
    marginTop: 6,
  },


  white: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },


  profit: {
    color: "#72E572",
    fontWeight: "bold",
  },


  loss: {
    color: "#FF5C5C",
    fontWeight: "bold",
  },


  emptyText: {
    color: "#777777",
    fontSize: 14,
    textAlign: "center",
    marginTop: 30,
    fontWeight: "bold",
  },


  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },


  editButton: {
    backgroundColor: "#333333",
    paddingVertical: 10,
    width: "31%",
    alignItems: "center",
    borderRadius: 7,
  },


  closeButton: {
    backgroundColor: "#8C6B16",
    paddingVertical: 10,
    width: "31%",
    alignItems: "center",
    borderRadius: 7,
  },


  deleteButton: {
    backgroundColor: "#7A2525",
    paddingVertical: 10,
    width: "31%",
    alignItems: "center",
    borderRadius: 7,
  },


  closedActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },


  editLargeButton: {
    backgroundColor: "#333333",
    paddingVertical: 11,
    width: "48%",
    alignItems: "center",
    borderRadius: 7,
  },


  deleteLargeButton: {
    backgroundColor: "#7A2525",
    paddingVertical: 11,
    width: "48%",
    alignItems: "center",
    borderRadius: 7,
  },


  actionText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },


  bottomNav: {
    height: 76,
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderTopColor: "#292929",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },


  navButton: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    height: 76,
  },


  navIcon: {
    color: "#777777",
    fontSize: 22,
    fontWeight: "bold",
  },


  navText: {
    color: "#777777",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "bold",
  },


  navActive: {
    color: GOLD,
  },


  /* MODALS */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },


  modalScroll: {
    justifyContent: "center",
    flexGrow: 1,
    paddingVertical: 20,
  },


  modalCard: {
    backgroundColor: "#171717",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "#3A3A3A",
  },


  modalTitle: {
    color: GOLD,
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },


  modalSignalText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
  },


  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 25,
  },


  modalCancelButton: {
    backgroundColor: "#333333",
    width: "47%",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },


  modalConfirmButton: {
    backgroundColor: GOLD,
    width: "47%",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },


  modalConfirmText: {
    color: "#000000",
    fontSize: 11,
    fontWeight: "bold",
  },

});
