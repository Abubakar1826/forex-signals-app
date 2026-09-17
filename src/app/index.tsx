import React, { useState, useEffect, useRef } from "react";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Share,
  Alert,
  Platform,
} from "react-native";

import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";


const GOLD = "#D4AF37";
const FIRESTORE_PROJECT_ID = "forex-signals-800-pips";

const FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/signals`;


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
const FIRESTORE_BASE_URL =
  "https://firestore.googleapis.com/v1/projects/forex-signals-800-pips/databases/(default)/documents";




const USERS_FIRESTORE_URL =
  `${FIRESTORE_BASE_URL}/users`;


const USER_ID_STORAGE_KEY =
  "FOREX_SIGNALS_800_PIPS_USER_ID";

const TRIAL_START_STORAGE_KEY =
  "FOREX_SIGNALS_800_PIPS_TRIAL_START";

const TRIAL_DAYS = 15;


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


async function registerForPushNotificationsAsync() {

  try {

    if (Platform.OS === "android") {

      await Notifications.setNotificationChannelAsync(
        "signals",
        {
          name: "Signal Notifications",
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
          vibrationPattern: [0, 250, 250, 250],
        }
      );

    }

    const permission =
      await Notifications.getPermissionsAsync();

    let finalStatus =
      permission.status;

    if (finalStatus !== "granted") {

      const requested =
        await Notifications.requestPermissionsAsync();

      finalStatus =
        requested.status;

    }

    if (finalStatus !== "granted") {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) {

      console.log(
        "Push Token Error: EAS projectId is missing."
      );

      return null;

    }

    const tokenResponse =
      await Notifications.getExpoPushTokenAsync({
        projectId,
      });

    return tokenResponse.data || null;

  } catch (error) {

    console.log(
      "Push Token Registration Error:",
      error
    );

    return null;

  }

}




async function saveExpoPushTokenToFirestore(
  userId,
  pushToken,
  notificationEnabled = true
) {

  if (!userId || !pushToken) {
    return;
  }

  try {

    const updateUrl =
  `${USERS_FIRESTORE_URL}/${encodeURIComponent(userId)}?updateMask.fieldPaths=expoPushToken&updateMask.fieldPaths=notificationEnabled&updateMask.fieldPaths=pushTokenUpdatedAt`;

const response = await fetch(
  updateUrl,
      
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            expoPushToken: {
              stringValue: pushToken,
            },
            notificationEnabled: {
              booleanValue: !!notificationEnabled,
            },
            pushTokenUpdatedAt: {
              stringValue: new Date().toISOString(),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.log(
        "Push Token Firestore Error:",
        await response.text()
      );
    }

  } catch (error) {

    console.log(
      "Push Token Save Error:",
      error
    );

  }

}

export default function App() {

  const [activeTab, setActiveTab] = useState(0);

  const [firestoreSignals, setFirestoreSignals] =
    useState([]);

  const [loadingSignals, setLoadingSignals] =
    useState(true);

  const [firestoreLoaded, setFirestoreLoaded] =
    useState(false);

  const [page, setPage] =
    useState("HOME");

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [notifications, setNotifications] =
    useState(true);

  const [screenWidth, setScreenWidth] =
    useState(0);

  const [refreshing, setRefreshing] =
    useState(false);

  const [selectedYear, setSelectedYear] =
    useState(new Date().getFullYear());


  /* USER SYSTEM */

  const [userId, setUserId] =
    useState("");

  const [trialActive, setTrialActive] =
    useState(true);

  const [trialStart, setTrialStart] =
    useState("");

  const [trialDaysLeft, setTrialDaysLeft] =
    useState(TRIAL_DAYS);

  const [userType, setUserType] =
    useState("TRIAL");


  const scrollRef = useRef(null);

  const previousSignalsRef = useRef({});

  const firstLoadRef = useRef(true);


  /* FALLBACK SIGNALS */

  const fallbackSignals = [

    {
      id: "1",
      pair: "EUR/USD",
      type: "BUY",
      status: "OPEN",
      started: "29 Aug 2026, 08:30 PM",
      entry: "1.1560",
    },

    {
      id: "2",
      pair: "GBP/USD",
      type: "SELL",
      status: "OPEN",
      started: "30 Aug 2026, 11:15 AM",
      entry: "1.3480",
    },

    {
      id: "3",
      pair: "USD/JPY",
      type: "BUY",
      status: "OPEN",
      started: "31 Aug 2026, 09:00 AM",
      entry: "147.250",
    },

    {
      id: "4",
      pair: "EUR/USD",
      type: "BUY",
      status: "CLOSED",
      started: "15 Jan 2026, 08:30 PM",
      entry: "1.1560",
      closed: "16 Jan 2026, 02:45 PM",
      closedPrice: "1.1590",
      pips: 30,
    },

    {
      id: "5",
      pair: "GBP/USD",
      type: "SELL",
      status: "CLOSED",
      started: "20 Jan 2026, 10:20 AM",
      entry: "1.3650",
      closed: "21 Jan 2026, 04:30 PM",
      closedPrice: "1.3670",
      pips: -20,
    },

    {
      id: "6",
      pair: "GOLD",
      type: "BUY",
      status: "CLOSED",
      started: "05 Feb 2026, 09:15 AM",
      entry: "2850",
      closed: "06 Feb 2026, 01:20 PM",
      closedPrice: "2930",
      pips: 80,
    },

    {
      id: "7",
      pair: "USD/CAD",
      type: "SELL",
      status: "CLOSED",
      started: "18 Feb 2026, 12:00 PM",
      entry: "1.4200",
      closed: "19 Feb 2026, 03:00 PM",
      closedPrice: "1.4140",
      pips: 60,
    },

    {
      id: "8",
      pair: "EUR/JPY",
      type: "SELL",
      status: "CLOSED",
      started: "10 Mar 2026, 08:00 AM",
      entry: "162.50",
      closed: "11 Mar 2026, 06:00 PM",
      closedPrice: "164.00",
      pips: -150,
    },

  ];


  const [signals] =
    useState(fallbackSignals);



  /* DATE PARSER */

  function parseSignalDate(dateString) {

    if (!dateString) {
      return new Date(0);
    }

    const text =
      String(dateString).trim();


    /* ISO DATE SUPPORT */

    const normalDate =
      new Date(text);

    if (
      !isNaN(
        normalDate.getTime()
      )
    ) {
      return normalDate;
    }

    /* NUMERIC DATE SUPPORT */

    const numericMatch = text.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
    );

    if (numericMatch) {
      const first = Number(numericMatch[1]);
      const second = Number(numericMatch[2]);
      const year = Number(numericMatch[3]);
      let hour = Number(numericMatch[4]);
      const minute = Number(numericMatch[5]);
      const secondValue = Number(numericMatch[6] || 0);
      const ampm = numericMatch[7]
        ? numericMatch[7].toUpperCase()
        : "";

      let month;
      let day;

      if (first > 12) {
        day = first;
        month = second - 1;
      } else if (second > 12) {
        month = first - 1;
        day = second;
      } else {
        month = first - 1;
        day = second;
      }

      if (ampm === "PM" && hour < 12) {
        hour += 12;
      }

      if (ampm === "AM" && hour === 12) {
        hour = 0;
      }

      const result = new Date(
        year,
        month,
        day,
        hour,
        minute,
        secondValue
      );

      if (!isNaN(result.getTime())) {
        return result;
      }
    }
    /* FORMAT:
       04 Sep 2026, 10:30 PM
       4 September 2026, 10:30 PM
    */

    const match =
      text.match(
        /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i
      );


    if (match) {

      const day =
        Number(match[1]);

      const monthText =
        match[2]
          .substring(0, 3)
          .toLowerCase();

      const year =
        Number(match[3]);

      let hour =
        Number(match[4]);

      const minute =
        Number(match[5]);

      const ampm =
        match[6]
          ? match[6].toUpperCase()
          : "";


      const monthMap = {

        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,

      };


      const month =
        monthMap[monthText];


      if (
        month !== undefined
      ) {

        if (
          ampm === "PM" &&
          hour < 12
        ) {
          hour += 12;
        }


        if (
          ampm === "AM" &&
          hour === 12
        ) {
          hour = 0;
        }


        return new Date(
          year,
          month,
          day,
          hour,
          minute,
          0
        );

      }

    }


    return new Date(0);

  }



  /* FIRESTORE VALUE READER */

  function getFirestoreValue(field) {

    if (!field) {
      return "";
    }


    if (
      field.stringValue !== undefined
    ) {
      return field.stringValue;
    }


    if (
      field.integerValue !== undefined
    ) {
      return field.integerValue;
    }


    if (
      field.doubleValue !== undefined
    ) {
      return field.doubleValue;
    }


    if (
      field.booleanValue !== undefined
    ) {
      return field.booleanValue;
    }


    if (
      field.timestampValue !== undefined
    ) {
      return field.timestampValue;
    }


    return "";

  }



  /* CREATE PERMANENT USER ID */

  async function getOrCreateUserId() {

    try {

      const savedUserId =
        await AsyncStorage.getItem(
          USER_ID_STORAGE_KEY
        );


      if (savedUserId) {

        setUserId(
          savedUserId
        );

        return savedUserId;

      }


      const newUserId =
        `user_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 10)}`;


      await AsyncStorage.setItem(
        USER_ID_STORAGE_KEY,
        newUserId
      );


      setUserId(
        newUserId
      );


      return newUserId;

    } catch (error) {

      console.log(
        "User ID Error:",
        error
      );

      return "";

    }

  }



  /* SAVE USER TO FIREBASE */

  async function saveUserToFirestore(
    currentUserId,
    currentTrialStart,
    currentTrialStatus,
    currentUserType
  ) {

    if (!currentUserId) {
      return;
    }


    try {

      const response =
        await fetch(
          `${USERS_FIRESTORE_URL}/${currentUserId}`,
          {

            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

              fields: {

                userId: {
                  stringValue:
                    currentUserId,
                },

                trialStart: {
                  stringValue:
                    currentTrialStart,
                },

                trialStatus: {
                  stringValue:
                    currentTrialStatus,
                },

                userType: {
                  stringValue:
                    currentUserType,
                },

                lastActive: {
                  stringValue:
                    new Date().toISOString(),
                },

              },

            }),

          }
        );


      if (!response.ok) {

        const errorData =
          await response.json();

        console.log(
          "User Firebase Error:",
          errorData
        );

      }

    } catch (error) {

      console.log(
        "User Firebase Error:",
        error
      );

    }

  }



  /* LOAD USER FROM FIREBASE */

  async function loadUserFromFirestore(
    currentUserId
  ) {

    if (!currentUserId) {
      return null;
    }


    try {

      const response =
        await fetch(
          `${USERS_FIRESTORE_URL}/${currentUserId}`
        );


      if (!response.ok) {
        return null;
      }


      const data =
        await response.json();


      const fields =
        data.fields || {};


      return {

        userId:
          getFirestoreValue(
            fields.userId
          ),

        trialStart:
          getFirestoreValue(
            fields.trialStart
          ),

        trialStatus:
          getFirestoreValue(
            fields.trialStatus
          ),

        userType:
          getFirestoreValue(
            fields.userType
          ),

        notificationEnabled:
          fields.notificationEnabled?.booleanValue !== undefined
            ? fields.notificationEnabled.booleanValue
            : true,

      };

    } catch (error) {

      console.log(
        "Load User Error:",
        error
      );

      return null;

    }

  }



  /* TRIAL SYSTEM */

  async function setupTrialSystem() {

    try {

      const currentUserId =
        await getOrCreateUserId();


      if (!currentUserId) {
        return;
      }


      const firebaseUser =
        await loadUserFromFirestore(
          currentUserId
        );


      let savedTrialStart =
        await AsyncStorage.getItem(
          TRIAL_START_STORAGE_KEY
        );


      /* FIREBASE TRIAL START */

      if (
        firebaseUser &&
        firebaseUser.trialStart
      ) {

        savedTrialStart =
          firebaseUser.trialStart;


        await AsyncStorage.setItem(
          TRIAL_START_STORAGE_KEY,
          savedTrialStart
        );

      }


      /* FIRST TIME USER */

      if (!savedTrialStart) {

        savedTrialStart =
          new Date().toISOString();


        await AsyncStorage.setItem(
          TRIAL_START_STORAGE_KEY,
          savedTrialStart
        );

      }


      const trialStartDate =
        new Date(savedTrialStart);


      const currentDate =
        new Date();


      const difference =
        currentDate.getTime() -
        trialStartDate.getTime();


      const daysPassed =
        Math.floor(
          difference /
            (
              1000 *
              60 *
              60 *
              24
            )
        );


      const remainingDays =
        Math.max(
          0,
          TRIAL_DAYS - daysPassed
        );


      const isTrialActive =
        daysPassed < TRIAL_DAYS;


      const currentTrialStatus =
        isTrialActive
          ? "ACTIVE"
          : "EXPIRED";


      const currentUserType =
        isTrialActive
          ? "TRIAL"
          : "EXPIRED";


      setTrialStart(
        savedTrialStart
      );

      setTrialDaysLeft(
        remainingDays
      );

      setTrialActive(
        isTrialActive
      );

      setUserType(
        currentUserType
      );


      /* SAVE TO FIREBASE */

      await saveUserToFirestore(
        currentUserId,
        savedTrialStart,
        currentTrialStatus,
        currentUserType
      );

    } catch (error) {

      console.log(
        "Trial Error:",
        error
      );

    }

  }



  useEffect(() => {

    setupTrialSystem();

  }, []);



  /* NOTIFICATIONS SETUP */

  useEffect(() => {

    async function setupNotifications() {

      try {

        if (
          Platform.OS === "android"
        ) {

          await Notifications.setNotificationChannelAsync(
            "signals",
            {

              name:
                "Signal Notifications",

              importance:
                Notifications.AndroidImportance.HIGH,

              sound:
                "default",

            }
          );

        }


        const permission =
          await Notifications.getPermissionsAsync();


        if (
          permission.status !==
          "granted"
        ) {

          await Notifications.requestPermissionsAsync();

        }

      } catch (error) {

        console.log(
          "Notification Error:",
          error
        );

      }

    }


    setupNotifications();

  }, []);


  /* REGISTER DEVICE FOR SERVER PUSH NOTIFICATIONS */

  useEffect(() => {

    async function registerDevicePushToken() {

      try {

        const currentUserId =
          await getOrCreateUserId();

        const pushToken =
          await registerForPushNotificationsAsync();

        if (
          currentUserId &&
          pushToken
        ) {

          await saveExpoPushTokenToFirestore(
            currentUserId,
            pushToken,
            notifications
          );

        }

      } catch (error) {

        console.log(
          "Device Push Registration Error:",
          error
        );

      }

    }

    registerDevicePushToken();

  }, []);



  /* SIGNAL NOTIFICATION */

  async function sendSignalNotification(
    signal,
    status
  ) {

    /* REMOTE PUSH ONLY: server/admin sends signal notifications.
       Firestore polling must not create duplicate local notifications. */
    return;

    if (!notifications) {
      return;
    }


    try {

      const pair =
        signal.pair ||
        "FOREX SIGNAL";


      const type =
        String(
          signal.type || ""
        ).toUpperCase();


      await Notifications.scheduleNotificationAsync({

        content: {

          title:

            status === "OPEN"

              ? "🔔 New Open Signal"

              : "🔔 Closed Signal",


          body:
            `${pair} — ${type}`,


          sound:
            "default",

        },


        trigger:
  Platform.OS === "android"
    ? {
        type:
          Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: "signals",
      }
    : null,

      });

    } catch (error) {

      console.log(
        "Signal Notification Error:",
        error
      );

    }

  }



  async function updateNotificationPreference(enabled) {

    setNotifications(enabled);

    try {

      const currentUserId =
        userId ||
        await getOrCreateUserId();

      if (!currentUserId) {
        return;
      }

      await fetch(
        `${USERS_FIRESTORE_URL}/${encodeURIComponent(currentUserId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              notificationEnabled: {
                booleanValue: !!enabled,
              },
              notificationPreferenceUpdatedAt: {
                stringValue: new Date().toISOString(),
              },
            },
          }),
        }
      );

    } catch (error) {

      console.log(
        "Notification Preference Error:",
        error
      );

    }

  }


  /* TEST NOTIFICATION */

  async function sendTestNotification() {

    if (!notifications) {

      Alert.alert(
        "Notifications Off",
        "Please enable notifications from Settings."
      );

      return;

    }


    try {

      await Notifications.scheduleNotificationAsync({

        content: {

          title:
            "🔔 FOREX SIGNALS 800 PIPS",

          body:
            "Test notification is working successfully.",

          sound:
            "default",

        },


        trigger:
  Platform.OS === "android"
    ? {
        type:
          Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        channelId: "signals",
      }
    : null,

      });

    } catch (error) {

      console.log(
        "Test Notification Error:",
        error
      );

    }

  }



  /* LOAD SIGNALS FROM FIRESTORE */

  async function loadSignals(
    showRefresh = false
  ) {

    if (showRefresh) {

      setRefreshing(true);

    }


    try {

      const response =
        await fetch(
          FIRESTORE_URL
        );


      const data =
        await response.json();


      if (!response.ok) {

        console.log(
          "Firestore Error:",
          data
        );

        return;

      }


      const loadedSignals =
  (data.documents || []).map(
    (doc) => {

      const fields =
        doc.fields || {};

      const statusValue =
        getFirestoreValue(
          fields.status ||
          fields.Status ||
          fields.STATUS
        );

      return {

        id:
          doc.name,

        pair:
          getFirestoreValue(
            fields.pair ||
            fields.Pair
          ),

        type:
          getFirestoreValue(
            fields.type ||
            fields.Type
          ),

        status:
          String(
            statusValue || ""
          )
            .trim()
            .toUpperCase(),

        started:
          getFirestoreValue(
            fields.started ||
            fields.StartedAt ||
            fields.startedAt ||
            fields.Started
          ),

        entry:
          getFirestoreValue(
            fields.entry ||
            fields.Entry
          ),

        closed:
          getFirestoreValue(
            fields.closed ||
            fields.ClosedAt ||
            fields.closedAt ||
            fields.Closed
          ),

        closedPrice:
          getFirestoreValue(
            fields.closedPrice ||
            fields.ClosedPrice ||
            fields.closed_price
          ),

        pips:
          Number(
            getFirestoreValue(
              fields.pips ||
              fields.Pips
            )
          ) || 0,

      };

    }
  );


      /* NOTIFICATION FIRST LOAD */

      if (
        firstLoadRef.current
      ) {

        const snapshot = {};


        loadedSignals.forEach(
          (signal) => {

            snapshot[
              signal.id
            ] =
              String(
                signal.status
              ).toUpperCase();

          }
        );


        previousSignalsRef.current =
          snapshot;


        firstLoadRef.current =
          false;

      }


      /* NEW SIGNAL / CLOSED SIGNAL NOTIFICATION */

      else {

        const previous =
          previousSignalsRef.current;


        for (
          const signal of loadedSignals
        ) {

          const currentStatus =
            String(
              signal.status
            ).toUpperCase();


          const previousStatus =
            previous[
              signal.id
            ];


          /* NEW SIGNAL */

          if (!previousStatus) {

            if (
              currentStatus === "OPEN" ||
              currentStatus === "CLOSED"
            ) {

              await sendSignalNotification(
                signal,
                currentStatus
              );

            }

          }


          /* OPEN → CLOSED */

          else if (

            previousStatus !==
              currentStatus &&

            currentStatus ===
              "CLOSED"

          ) {

            await sendSignalNotification(
              signal,
              "CLOSED"
            );

          }

        }


        const newSnapshot = {};


        loadedSignals.forEach(
          (signal) => {

            newSnapshot[
              signal.id
            ] =
              String(
                signal.status
              ).toUpperCase();

          }
        );


        previousSignalsRef.current =
          newSnapshot;

      }


      /* FIRESTORE DATA */

      setFirestoreSignals(
        loadedSignals
      );


      setFirestoreLoaded(
        true
      );

    } catch (error) {

      console.log(
        "Firestore Error:",
        error
      );

    } finally {

      setLoadingSignals(
        false
      );


      if (showRefresh) {

        setRefreshing(
          false
        );

      }

    }

  }



  /* AUTO REFRESH */

  useEffect(() => {

    loadSignals();


    const interval =
      setInterval(() => {

        loadSignals();

      }, 30000);


    return () =>
      clearInterval(
        interval
      );

  }, []);



  /* SIGNAL SOURCE */

  const allSignals =

    firestoreLoaded

      ? firestoreSignals

      : signals;



  /* ACTIVE SIGNALS */

  const activeSignals =
    allSignals

      .filter(

        (signal) =>

          String(
            signal.status
          ).toUpperCase() ===
          "OPEN"

      )

      /* LATEST ACTIVE SIGNAL TOP */

      .sort(

        (a, b) =>

          parseSignalDate(
            b.started
          ).getTime()

          -

          parseSignalDate(
            a.started
          ).getTime()

      );



  /* CLOSED SIGNALS */

  const closedSignals =
    allSignals

      .filter(

        (signal) =>

          String(
            signal.status
          ).toUpperCase() ===
          "CLOSED"

      )

      /* LATEST ClosedAt = TOP */

      .sort(

        (a, b) =>

          parseSignalDate(
            b.closed ||
            b.started
          ).getTime()

          -

          parseSignalDate(
            a.closed ||
            a.started
          ).getTime()

      );



  /* MONTHS */

  const months = [

    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",

  ];



  /* SIGNAL CLOSED DATE */

  function getSignalDate(signal) {

  return parseSignalDate(

    signal.closedAt ||
    signal.closed ||
    signal.started

  );

}



  /* AVAILABLE YEARS */

  const availableYears = [

    ...new Set(

      closedSignals

        .map(

          (signal) =>

            getSignalDate(
              signal
            ).getFullYear()

        )

        .filter(

          (year) =>

            !isNaN(year) &&
            year > 1970

        )

    ),

  ].sort(

    (a, b) =>
      b - a

  );



  /* AUTO SELECT LATEST YEAR */

  useEffect(() => {

    if (

      availableYears.length > 0 &&

      !availableYears.includes(
        selectedYear
      )

    ) {

      setSelectedYear(
        availableYears[0]
      );

    }

  }, [

    allSignals.length

  ]);



  /* MONTHLY PIPS */

  function monthlyPips(
    year,
    monthIndex
  ) {

    return closedSignals

      .filter(

        (signal) => {

          const date =
            getSignalDate(
              signal
            );


          return (

            date.getFullYear() ===
              year &&

            date.getMonth() ===
              monthIndex

          );

        }

      )

      .reduce(

        (total, signal) =>

          total +

          (
            Number(
              signal.pips
            ) || 0
          ),

        0

      );

  }



  /* MONTH DATA CHECK */

  function hasMonthData(
    year,
    monthIndex
  ) {

    return closedSignals.some(

      (signal) => {

        const date =
          getSignalDate(
            signal
          );


        return (

          date.getFullYear() ===
            year &&

          date.getMonth() ===
            monthIndex

        );

      }

    );

  }



  /* YEAR TOTAL */

  function yearTotal(year) {

    return closedSignals

      .filter(

        (signal) =>

          getSignalDate(
            signal
          ).getFullYear() ===
          year

      )

      .reduce(

        (total, signal) =>

          total +

          (
            Number(
              signal.pips
            ) || 0
          ),

        0

      );

  }



  /* TAB CHANGE */

  function changeTab(index) {

    setActiveTab(index);


    if (

      screenWidth > 0 &&

      scrollRef.current

    ) {

      scrollRef.current.scrollTo({

        x:
          screenWidth *
          index,

        animated:
          true,

      });

    }

  }



  /* SWIPE TAB */

  function handleScroll(event) {

    if (!screenWidth) {
      return;
    }


    const x =
      event.nativeEvent
        .contentOffset.x;


    const index =
      Math.round(
        x / screenWidth
      );


    if (

      index >= 0 &&

      index <= 2 &&

      index !== activeTab

    ) {

      setActiveTab(index);

    }

  }



  /* OPEN PAGE */

  function openPage(name) {

    setMenuOpen(false);

    setPage(name);

  }



  /* SHARE APP */

  async function shareApp() {

    try {

      await Share.share({

        message:

          "Check out FOREX SIGNALS 800 PIPS for forex signals and monthly performance reports.",

      });

    } catch (error) {

      console.log(
        error
      );

    }

  }



  /* PAGE HEADER */

  function PageHeader({
    title
  }) {

    return (

      <View
        style={
          styles.pageHeader
        }
      >

        <TouchableOpacity

          style={
            styles.backButton
          }

          onPress={() =>
            setPage("HOME")
          }

        >

          <Text
            style={
              styles.backText
            }
          >
            ←
          </Text>

        </TouchableOpacity>


        <Text
          style={
            styles.pageTitle
          }
        >
          {title}
        </Text>


        <View
          style={{
            width: 45
          }}
        />

      </View>

    );

  }



  /* INFO PAGE */

  function InfoPage({
    title,
    children
  }) {

    return (

      <View
        style={
          styles.container
        }
      >

        <PageHeader
          title={title}
        />


        <ScrollView

          style={
            styles.pageScroll
          }

          showsVerticalScrollIndicator={
            false
          }

        >

          {children}

          <View
            style={{
              height: 40
            }}
          />

        </ScrollView>

      </View>

    );

  }



  /* SETTINGS PAGE */

  if (
    page === "SETTINGS"
  ) {

    return (

      <View
        style={
          styles.container
        }
      >

        <PageHeader
          title="SETTINGS"
        />


        <ScrollView
          style={
            styles.settingsContent
          }
        >


          <View
            style={
              styles.settingRow
            }
          >

            <View
              style={{
                flex: 1
              }}
            >

              <Text
                style={
                  styles.settingTitle
                }
              >
                Notifications
              </Text>


              <Text
                style={
                  styles.settingDescription
                }
              >
                Receive important signal updates.
              </Text>

            </View>


            <Switch

              value={
                notifications
              }

              onValueChange={
                updateNotificationPreference
              }

            />

          </View>



          <TouchableOpacity

            style={
              styles.testButton
            }

            onPress={
              sendTestNotification
            }

          >

            <Text
              style={
                styles.testButtonText
              }
            >
              🔔 TEST NOTIFICATION
            </Text>

          </TouchableOpacity>



          {/* USER ID */}

          <View
            style={
              styles.settingRow
            }
          >

            <View
              style={{
                flex: 1
              }}
            >

              <Text
                style={
                  styles.settingTitle
                }
              >
                User ID
              </Text>


              <Text
                style={
                  styles.userIdText
                }
                selectable
              >
                {userId ||
                  "Loading..."}
              </Text>

            </View>

          </View>



          {/* TRIAL */}

          <View
            style={
              styles.settingRow
            }
          >

            <View>

              <Text
                style={
                  styles.settingTitle
                }
              >
                Membership Status
              </Text>


              <Text
                style={
                  trialActive

                    ? styles.trialActiveText

                    : styles.trialExpiredText
                }
              >

                {trialActive

                  ? `FREE TRIAL — ${trialDaysLeft} DAYS LEFT`

                  : "TRIAL EXPIRED"}

              </Text>


              <Text
                style={
                  styles.settingDescription
                }
              >
                User Type: {userType}
              </Text>

            </View>

          </View>



          <View
            style={
              styles.settingRow
            }
          >

            <View>

              <Text
                style={
                  styles.settingTitle
                }
              >
                Notification Delay
              </Text>


              <Text
                style={
                  styles.settingDescription
                }
              >
                Signal updates are checked every 30 seconds.
              </Text>

            </View>

          </View>



          <View
            style={
              styles.settingRow
            }
          >

            <View>

              <Text
                style={
                  styles.settingTitle
                }
              >
                App Version
              </Text>


              <Text
                style={
                  styles.settingDescription
                }
              >
                Version 1.0.0
              </Text>

            </View>

          </View>


        </ScrollView>

      </View>

    );

  }



  /* PREMIUM PAGE */

  if (
    page === "PREMIUM"
  ) {

    return (

      <InfoPage
        title="PREMIUM"
      >


        <View
          style={
            styles.premiumHero
          }
        >

          <Text
            style={
              styles.star
            }
          >
            ★
          </Text>


          <Text
            style={
              styles.premiumTitle
            }
          >
            FOREX SIGNALS 800 PIPS
          </Text>


          <Text
            style={
              styles.premiumSub
            }
          >
            PREMIUM MEMBERSHIP
          </Text>

        </View>



        <View
          style={
            styles.trialCard
          }
        >

          <Text
            style={
              styles.goldSmall
            }
          >
            WELCOME OFFER
          </Text>


          <Text
            style={
              styles.trialDays
            }
          >
            15 DAYS
          </Text>


          <Text
            style={
              styles.freeText
            }
          >
            FREE TRIAL
          </Text>


          <Text
            style={
              styles.grayCenter
            }
          >
            Experience our signals and transparency before becoming a Premium Member.
          </Text>

        </View>



        <Text
          style={
            styles.sectionTitle
          }
        >
          PREMIUM BENEFITS
        </Text>



        <View
          style={
            styles.darkBox
          }
        >

          <Text
            style={
              styles.benefit
            }
          >
            ✓ Full Access to Active Signals
          </Text>


          <Text
            style={
              styles.benefit
            }
          >
            ✓ Complete Closed Signal History
          </Text>


          <Text
            style={
              styles.benefit
            }
          >
            ✓ Monthly Performance Reports
          </Text>


          <Text
            style={
              styles.benefit
            }
          >
            ✓ Clean & Transparent Pips
          </Text>


          <Text
            style={
              styles.benefit
            }
          >
            ✓ Signal Update Notifications
          </Text>

        </View>



        <View
          style={
            styles.priceCard
          }
        >

          <Text
            style={
              styles.goldSmall
            }
          >
            PREMIUM MEMBERSHIP
          </Text>


          <Text
            style={
              styles.price
            }
          >
            $30
          </Text>


          <Text
            style={
              styles.perMonth
            }
          >
            PER MONTH
          </Text>

        </View>



        <TouchableOpacity

          style={
            styles.goldButton
          }

          onPress={() =>

            Alert.alert(

              "PREMIUM MEMBERSHIP",

              "Google Play subscription system will be connected in the final production version."

            )

          }

        >

          <Text
            style={
              styles.goldButtonText
            }
          >
            START PREMIUM MEMBERSHIP
          </Text>

        </TouchableOpacity>


      </InfoPage>

    );

  }



  /* HELP PAGE */

  if (
    page === "HELP"
  ) {

    return (

      <InfoPage
        title="HELP CENTER"
      >

        <Text
          style={
            styles.sectionTitle
          }
        >
          HOW TO USE THE APP
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          1. Active Signals
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          View all currently open forex signals in the Active Signals section.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          2. Closed Signals
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          When a signal is closed, it is automatically removed from Active Signals and shown only in Closed Signals.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          3. Monthly Report
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Monthly reports automatically calculate the total profit or loss in pips from closed signals.
        </Text>


        <Text
          style={
            styles.sectionTitle
          }
        >
          MONEY MANAGEMENT
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Follow strict money management. As a general guideline, use 0.01 lot size for every $500 equity or more.
        </Text>


        <Text
          style={
            styles.sectionTitle
          }
        >
          RISK WARNING
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Forex trading involves significant risk. Trade only with money you can afford to lose.
        </Text>

      </InfoPage>

    );

  }



  /* ABOUT PAGE */

  if (
    page === "ABOUT"
  ) {

    return (

      <InfoPage
        title="ABOUT"
      >

        <Text
          style={
            styles.aboutTitle
          }
        >
          FOREX SIGNALS 800 PIPS
        </Text>


        <Text
          style={
            styles.sectionTitle
          }
        >
          WHY CHOOSE US?
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          Clean & Clear Pips
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          We provide transparent trading results in pips without complicated TP1, TP2 or TP3 systems.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          15-Day Free Trial
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Experience our service and transparency before becoming a Premium Member.
        </Text>


        <Text
          style={
            styles.rating
          }
        >
          ★★★★★
        </Text>

      </InfoPage>

    );

  }



  /* CONTACT */

  if (
    page === "CONTACT"
  ) {

    return (

      <InfoPage
        title="CONTACT US"
      >

        <Text
          style={
            styles.sectionTitle
          }
        >
          CONTACT DETAILS
        </Text>


        <View
          style={
            styles.contactCard
          }
        >

          <Text
            style={
              styles.contactLabel
            }
          >
            EMAIL
          </Text>


          <Text
            style={
              styles.contactValue
            }
          >
            Abubakarmughal1826@gmail.com
          </Text>

        </View>



        <View
          style={
            styles.contactCard
          }
        >

          <Text
            style={
              styles.contactLabel
            }
          >
            ADDRESS
          </Text>


          <Text
            style={
              styles.contactValue
            }
          >
            Ward No. 11{"\n"}
            Kot Addu, Punjab{"\n"}
            Pakistan
          </Text>

        </View>

      </InfoPage>

    );

  }



  /* PRIVACY POLICY */

  if (
    page === "PRIVACY"
  ) {
    return (
      <InfoPage
        title="PRIVACY POLICY"
      >
        <Text
          style={
            styles.sectionTitle
          }
        >
          PRIVACY POLICY
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          About This Policy
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          FOREX SIGNALS 800 PIPS respects your privacy. This policy explains how information is handled when you use the app.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Information We Collect
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          The app does not require you to create an account or provide your name, phone number, or email address for basic use. A device-generated User ID may be used for app functionality and membership status.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Signal Data
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          Signal information may be stored and retrieved through Firebase/Firestore to provide active signals, closed signals, and monthly reports.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Notifications
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          If notifications are enabled, the app may send new and closed signal updates to your device. Notifications can be controlled through the app and device settings.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Payments
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          Premium subscriptions and payments are processed through Google Play. We do not collect or store your payment card or banking details.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Data Sharing
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          We do not sell personal information. Information required to operate the app may be processed by Firebase/Google services and Google Play.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Security and Retention
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          Reasonable measures are used to protect information handled by the app. Information is retained only as needed for app operation and related services.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Changes to This Policy
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          This Privacy Policy may be updated when the app or its data practices change. The updated policy will be made available within the app.
        </Text>

        <Text
          style={
            styles.heading
          }
        >
          Contact
        </Text>

        <Text
          style={
            styles.paragraph
          }
        >
          For privacy-related questions or requests, please use the developer contact information provided on the Google Play listing.
        </Text>

      </InfoPage>
    );
  }



  /* TERMS */

  if (
    page === "TERMS"
  ) {

    return (

      <InfoPage
        title="TERMS & CONDITIONS"
      >

        <Text
          style={
            styles.sectionTitle
          }
        >
          TERMS & CONDITIONS
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          Use of the App
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          This app provides forex signal information. Users are responsible for their own trading decisions.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          No Guaranteed Profits
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Forex trading involves substantial risk. We do not guarantee profits or returns.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          User Responsibility
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          You are solely responsible for your trading activity and financial decisions.
        </Text>

      </InfoPage>

    );

  }



  /* DISCLAIMER */

  if (
    page === "DISCLAIMER"
  ) {

    return (

      <InfoPage
        title="DISCLAIMER"
      >

        <Text
          style={
            styles.sectionTitle
          }
        >
          IMPORTANT DISCLAIMER
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Forex trading involves a high level of risk and may not be suitable for all investors.
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          Past performance does not guarantee future results, and no profit is guaranteed.
        </Text>


        <Text
          style={
            styles.heading
          }
        >
          NOT FINANCIAL ADVICE
        </Text>


        <Text
          style={
            styles.paragraph
          }
        >
          FOREX SIGNALS 800 PIPS does not provide financial advice and does not guarantee profits.
        </Text>

      </InfoPage>

    );

  }



  /* HOME */

  return (

    <View

      style={
        styles.container
      }

      onLayout={(event) => {

        const width =
          event.nativeEvent
            .layout.width;


        if (

          width > 0 &&

          width !== screenWidth

        ) {

          setScreenWidth(
            width
          );

        }

      }}

    >


      {/* HEADER */}

      <View
        style={
          styles.header
        }
      >

        <TouchableOpacity

          style={
            styles.menuButton
          }

          onPress={() =>
            setMenuOpen(
              !menuOpen
            )
          }

        >

          <Text
            style={
              styles.menuIcon
            }
          >
            ☰
          </Text>

        </TouchableOpacity>



        <Text
          style={
            styles.mainTitle
          }
        >
          FOREX SIGNALS 800 PIPS
        </Text>



        <View
          style={
            styles.headerRight
          }
        >

          <TouchableOpacity

            style={
              styles.bellButton
            }

            onPress={
              sendTestNotification
            }

          >

            <Text
              style={
                styles.bellIcon
              }
            >
              🔔
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.refreshButton
            }

            onPress={() =>
              loadSignals(
                true
              )
            }

          >

            <Text
              style={
                styles.refreshIcon
              }
            >

              {refreshing
                ? "..."
                : "↻"}

            </Text>

          </TouchableOpacity>

        </View>

      </View>



      {/* MENU */}

      {menuOpen && (

        <View
          style={
            styles.menuBox
          }
        >


          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "SETTINGS"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ⚙ Settings
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "PREMIUM"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ★ Premium
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "HELP"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ? Help Center
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() => {

              setMenuOpen(
                false
              );

              shareApp();

            }}

          >

            <Text
              style={
                styles.menuText
              }
            >
              ↗ Share
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "CONTACT"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ✉ Contact Us
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "ABOUT"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ⓘ About
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "PRIVACY"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              🔒 Privacy Policy
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "TERMS"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              📄 Terms & Conditions
            </Text>

          </TouchableOpacity>



          <TouchableOpacity

            style={
              styles.menuItem
            }

            onPress={() =>
              openPage(
                "DISCLAIMER"
              )
            }

          >

            <Text
              style={
                styles.menuText
              }
            >
              ⚠ Disclaimer
            </Text>

          </TouchableOpacity>


        </View>

      )}



      {/* TABS */}

      <View
        style={
          styles.tabs
        }
      >


        <TouchableOpacity

          style={[

            styles.tab,

            activeTab === 0 &&
              styles.activeTab,

          ]}

          onPress={() =>
            changeTab(0)
          }

        >

          <Text
            style={
              styles.tabText
            }
          >
            ACTIVE SIGNALS
          </Text>

        </TouchableOpacity>



        <TouchableOpacity

          style={[

            styles.tab,

            activeTab === 1 &&
              styles.activeTab,

          ]}

          onPress={() =>
            changeTab(1)
          }

        >

          <Text
            style={
              styles.tabText
            }
          >
            CLOSED SIGNALS
          </Text>

        </TouchableOpacity>



        <TouchableOpacity

          style={[

            styles.tab,

            activeTab === 2 &&
              styles.activeTab,

          ]}

          onPress={() =>
            changeTab(2)
          }

        >

          <Text
            style={
              styles.tabText
            }
          >
            MONTHLY REPORT
          </Text>

        </TouchableOpacity>


      </View>



      {screenWidth > 0 && (

        <ScrollView

          ref={
            scrollRef
          }

          horizontal

          pagingEnabled

          showsHorizontalScrollIndicator={
            false
          }

          onScroll={
            handleScroll
          }

          scrollEventThrottle={
            16
          }

          style={{
            flex: 1
          }}

        >


          {/* ACTIVE SIGNALS */}

          <ScrollView

            style={{
              width:
                screenWidth
            }}

            showsVerticalScrollIndicator={
              false
            }

            contentContainerStyle={{
              paddingBottom: 120,
            }}

          >


            {!trialActive ? (

              <View
                style={
                  styles.lockContainer
                }
              >

                <Text
                  style={
                    styles.lockIcon
                  }
                >
                  🔒
                </Text>


                <Text
                  style={
                    styles.lockTitle
                  }
                >
                  ACTIVE SIGNALS LOCKED
                </Text>


                <Text
                  style={
                    styles.lockText
                  }
                >
                  Your 15-day free trial has ended.
                </Text>


                <Text
                  style={
                    styles.lockText
                  }
                >
                  Upgrade to Premium to access new Active Signals.
                </Text>


                <TouchableOpacity

                  style={
                    styles.unlockButton
                  }

                  onPress={() =>
                    openPage(
                      "PREMIUM"
                    )
                  }

                >

                  <Text
                    style={
                      styles.unlockButtonText
                    }
                  >
                    UPGRADE TO PREMIUM
                  </Text>

                </TouchableOpacity>

              </View>

            ) : (

              <>


                {loadingSignals && (

                  <Text
                    style={
                      styles.loadingText
                    }
                  >
                    Loading signals...
                  </Text>

                )}



                {!loadingSignals &&

                  activeSignals.length === 0 && (

                    <Text
                      style={
                        styles.emptyText
                      }
                    >
                      No Active Signals
                    </Text>

                  )}



                {activeSignals.map(

                  (signal) => (

                    <View

                      key={
                        signal.id
                      }

                      style={
                        styles.signalCard
                      }

                    >

                      <View
                        style={
                          styles.signalTop
                        }
                      >

                        <Text
                          style={
                            styles.pair
                          }
                        >
                          {signal.pair}
                        </Text>


                        <Text

                          style={

                            String(
                              signal.type
                            ).toUpperCase() ===
                            "BUY"

                              ? styles.buy

                              : styles.sell

                          }

                        >
                          {signal.type}
                        </Text>

                      </View>



                      <Text
                        style={
                          styles.detail
                        }
                      >

                        Signal Started:{" "}

                        <Text
                          style={
                            styles.white
                          }
                        >
                          {signal.started}
                        </Text>

                      </Text>



                      <Text
                        style={
                          styles.detail
                        }
                      >

                        Entry:{" "}

                        <Text
                          style={
                            styles.white
                          }
                        >
                          {signal.entry}
                        </Text>

                      </Text>



                      <Text
                        style={
                          styles.detail
                        }
                      >

                        Current Status:{" "}

                        <Text
                          style={
                            styles.open
                          }
                        >
                          OPEN
                        </Text>

                      </Text>


                    </View>

                  )

                )}


              </>

            )}


          </ScrollView>



          {/* CLOSED SIGNALS */}

          <ScrollView

            style={{
              width:
                screenWidth
            }}

            showsVerticalScrollIndicator={
              false
            }

            contentContainerStyle={{
              paddingBottom: 120,
            }}

          >


            {loadingSignals && (

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading signals...
              </Text>

            )}



            {!loadingSignals &&

              closedSignals.length === 0 && (

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  No Closed Signals
                </Text>

              )}



            {closedSignals.map(

              (signal) => (

                <View

                  key={
                    signal.id
                  }

                  style={
                    styles.closedSignalCard
                  }

                >


                  <View
                    style={
                      styles.closedTop
                    }
                  >

                    <Text
                      style={
                        styles.closedPair
                      }
                    >
                      {signal.pair}
                    </Text>


                    <Text

                      style={

                        String(
                          signal.type
                        ).toUpperCase() ===
                        "BUY"

                          ? styles.closedBuy

                          : styles.closedSell

                      }

                    >
                      {signal.type}
                    </Text>


                    <Text

                      style={

                        Number(
                          signal.pips
                        ) >= 0

                          ? styles.closedProfit

                          : styles.closedLoss

                      }

                    >

                      {Number(
                        signal.pips
                      ) >= 0
                        ? "+"
                        : ""}

                      {signal.pips}

                    </Text>

                  </View>



                  <View
                    style={
                      styles.closedRow
                    }
                  >

                    <Text
                      style={
                        styles.closedLabel
                      }
                    >
                      Started:
                    </Text>


                    <Text

                      style={
                        styles.closedValue
                      }

                      numberOfLines={
                        1
                      }

                    >
                      {signal.started}
                    </Text>

                  </View>



                  <View
                    style={
                      styles.closedRow
                    }
                  >

                    <Text
                      style={
                        styles.closedLabel
                      }
                    >
                      Entry:
                    </Text>


                    <Text
                      style={
                        styles.closedValue
                      }
                    >
                      {signal.entry}
                    </Text>


                    <Text
                      style={
                        styles.closedMiniLabel
                      }
                    >
                      Close:
                    </Text>


                    <Text
                      style={
                        styles.closedValue
                      }
                    >
                      {signal.closedPrice}
                    </Text>

                  </View>



                  <View
                    style={
                      styles.closedRow
                    }
                  >

                    <Text
                      style={
                        styles.closedLabel
                      }
                    >
                      Closed:
                    </Text>


                    <Text

                      style={
                        styles.closedValue
                      }

                      numberOfLines={
                        1
                      }

                    >
                      {signal.closed}
                    </Text>

                  </View>


                </View>

              )

            )}


          </ScrollView>



          {/* MONTHLY REPORT */}

          <ScrollView

            style={{
              width:
                screenWidth
            }}

            
showsVerticalScrollIndicator={
              false
            }

          
            contentContainerStyle={{
              paddingBottom: 100
            }}
            >
            {availableYears.length > 1 && (

              <ScrollView

                horizontal

                showsHorizontalScrollIndicator={
                  false
                }

                contentContainerStyle={
                  styles.yearButtons
                }

              >

                {availableYears.map(

                  (year) => (

                    <TouchableOpacity

                      key={year}

                      style={[

                        styles.yearButton,

                        selectedYear ===
                          year &&

                          styles.selectedYearButton,

                      ]}

                      onPress={() =>
                        setSelectedYear(
                          year
                        )
                      }

                    >

                      <Text

                        style={[

                          styles.yearButtonText,

                          selectedYear ===
                            year &&

                            styles.selectedYearText,

                        ]}

                      >
                        {year}
                      </Text>

                    </TouchableOpacity>

                  )

                )}

              </ScrollView>

            )}



            <View
              style={
                styles.reportTitleBox
              }
            >

              <Text
                style={
                  styles.reportYear
                }
              >
                {selectedYear}
              </Text>

            </View>



            <View
              style={
                styles.reportCard
              }
            >


              {months.map(

                (
                  month,
                  index
                ) => {

                  const exists =
                    hasMonthData(
                      selectedYear,
                      index
                    );


                  const pips =
                    monthlyPips(
                      selectedYear,
                      index
                    );


                  return (

                    <View

                      key={
                        month
                      }

                      style={
                        styles.monthRow
                      }

                    >

                      <Text
                        style={
                          styles.monthName
                        }
                      >
                        {month}
                      </Text>


                      <Text

                        style={

                          !exists

                            ? styles.noData

                            : pips >= 0

                            ? styles.profit

                            : styles.loss

                        }

                      >

                        {exists

                          ? `${
                              pips >= 0
                                ? "+"
                                : ""
                            }${pips} PIPS`

                          : "--"}

                      </Text>

                    </View>

                  );

                }

              )}



              <View
                style={
                  styles.totalRow
                }
              >

                <Text
                  style={
                    styles.totalTitle
                  }
                >
                  TOTAL {selectedYear}
                </Text>


                <Text

                  style={

                    yearTotal(
                      selectedYear
                    ) >= 0

                      ? styles.profit

                      : styles.loss

                  }

                >

                  {yearTotal(
                    selectedYear
                  ) >= 0
                    ? "+"
                    : ""}

                  {yearTotal(
                    selectedYear
                  )} PIPS

                </Text>

              </View>


            </View>


          </ScrollView>


        </ScrollView>

      )}


    </View>

  );

}



/* STYLES */

const styles =
  StyleSheet.create({


    container: {
      flex: 1,
      backgroundColor: "#080808",
    },


    header: {
      paddingTop: 25,
      paddingBottom: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },


    menuButton: {
      width: 45,
      alignItems: "center",
    },


    menuIcon: {
      color: GOLD,
      fontSize: 26,
      fontWeight: "bold",
    },


    headerRight: {
      flexDirection: "row",
      alignItems: "center",
    },


    bellButton: {
      width: 38,
      alignItems: "center",
    },


    bellIcon: {
      fontSize: 22,
    },


    refreshButton: {
      width: 38,
      alignItems: "center",
    },


    refreshIcon: {
      color: GOLD,
      fontSize: 26,
      fontWeight: "bold",
    },


    mainTitle: {
      color: GOLD,
      fontSize: 18,
      fontWeight: "bold",
    },


    tabs: {
      flexDirection: "row",
      height: 36,
    },


    tab: {
      flex: 1,
      backgroundColor: "#191919",
      alignItems: "center",
      justifyContent: "center",
    },


    activeTab: {
      backgroundColor: "#8C6B16",
    },


    tabText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "bold",
      textAlign: "center",
    },


    menuBox: {
      position: "absolute",
      top: 65,
      left: 8,
      width: 250,
      backgroundColor: "#1A1A1A",
      borderRadius: 10,
      padding: 10,
      zIndex: 1000,
      elevation: 20,
      borderWidth: 1,
      borderColor: "#444",
    },


    menuItem: {
      paddingVertical: 10,
    },


    menuText: {
      color: "#FFFFFF",
      fontSize: 16,
    },


    signalCard: {
      marginHorizontal: 10,
      marginTop: 10,
      backgroundColor: "#171717",
      padding: 14,
      borderRadius: 9,
    },


    signalTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 5,
    },


    pair: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "bold",
    },


    buy: {
      color: "#72E572",
      fontSize: 16,
      fontWeight: "bold",
    },


    sell: {
      color: "#FF6868",
      fontSize: 16,
      fontWeight: "bold",
    },


    detail: {
      color: "#AAAAAA",
      fontSize: 14,
      marginTop: 7,
    },


    white: {
      color: "#FFFFFF",
      fontWeight: "bold",
    },


    open: {
      color: "#72E572",
      fontWeight: "bold",
    },


    profit: {
      color: "#72E572",
      fontWeight: "bold",
      fontSize: 16,
    },


    loss: {
      color: "#FF5C5C",
      fontWeight: "bold",
      fontSize: 16,
    },


    closedSignalCard: {
      marginHorizontal: 8,
      marginTop: 6,
      backgroundColor: "#171717",
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
    },


    closedTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 3,
    },


    closedPair: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "bold",
      flex: 1,
    },


    closedBuy: {
      color: "#72E572",
      fontSize: 12,
      fontWeight: "bold",
      marginRight: 12,
    },


    closedSell: {
      color: "#FF6868",
      fontSize: 12,
      fontWeight: "bold",
      marginRight: 12,
    },


    closedProfit: {
      color: "#72E572",
      fontSize: 15,
      fontWeight: "bold",
    },


    closedLoss: {
      color: "#FF5C5C",
      fontSize: 15,
      fontWeight: "bold",
    },


    closedRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 18,
    },


    closedLabel: {
      color: "#8F8F8F",
      fontSize: 10,
      width: 47,
    },


    closedMiniLabel: {
      color: "#8F8F8F",
      fontSize: 10,
      marginLeft: 12,
      marginRight: 4,
    },


    closedValue: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "500",
      flexShrink: 1,
    },


    loadingText: {
      color: GOLD,
      textAlign: "center",
      marginTop: 30,
      fontSize: 16,
    },


    emptyText: {
      color: "#888888",
      textAlign: "center",
      marginTop: 30,
      fontSize: 16,
    },


    lockContainer: {
      margin: 20,
      marginTop: 60,
      padding: 25,
      backgroundColor: "#171717",
      borderRadius: 15,
      borderWidth: 1,
      borderColor: GOLD,
      alignItems: "center",
    },


    lockIcon: {
      fontSize: 42,
      marginBottom: 12,
    },


    lockTitle: {
      color: GOLD,
      fontSize: 18,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 15,
    },


    lockText: {
      color: "#AAAAAA",
      fontSize: 14,
      textAlign: "center",
      lineHeight: 22,
    },


    unlockButton: {
      backgroundColor: GOLD,
      paddingVertical: 15,
      paddingHorizontal: 22,
      borderRadius: 10,
      marginTop: 25,
    },


    unlockButtonText: {
      color: "#000000",
      fontWeight: "bold",
    },


    yearButtons: {
      padding: 12,
    },


    yearButton: {
      backgroundColor: "#1A1A1A",
      paddingVertical: 9,
      paddingHorizontal: 17,
      borderRadius: 8,
      marginRight: 8,
    },


    selectedYearButton: {
      backgroundColor: "#8C6B16",
    },


    yearButtonText: {
      color: "#AAAAAA",
      fontWeight: "bold",
    },


    selectedYearText: {
      color: "#FFFFFF",
    },


    reportTitleBox: {
      alignItems: "center",
      marginTop: 5,
    },


    reportYear: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "bold",
    },


    reportCard: {
      margin: 10,
      backgroundColor: "#171717",
      borderRadius: 10,
      padding: 15,
    },


    monthRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: "#292929",
    },


    monthName: {
      color: "#FFFFFF",
      fontSize: 16,
    },


    noData: {
      color: "#666666",
      fontSize: 16,
    },


    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 17,
      marginTop: 5,
      borderTopWidth: 1,
      borderTopColor: GOLD,
    },


    totalTitle: {
      color: GOLD,
      fontSize: 17,
      fontWeight: "bold",
    },


    pageHeader: {
      paddingTop: 25,
      paddingBottom: 15,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },


    backButton: {
      width: 45,
      alignItems: "center",
    },


    backText: {
      color: GOLD,
      fontSize: 30,
    },


    pageTitle: {
      color: GOLD,
      fontSize: 18,
      fontWeight: "bold",
    },


    pageScroll: {
      paddingHorizontal: 15,
    },


    settingsContent: {
      padding: 15,
    },


    settingRow: {
      backgroundColor: "#171717",
      padding: 16,
      borderRadius: 10,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },


    settingTitle: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },


    settingDescription: {
      color: "#999999",
      fontSize: 12,
      marginTop: 5,
      lineHeight: 18,
    },


    userIdText: {
      color: GOLD,
      fontSize: 11,
      marginTop: 7,
    },


    trialActiveText: {
      color: "#72E572",
      fontSize: 13,
      fontWeight: "bold",
      marginTop: 7,
    },


    trialExpiredText: {
      color: "#FF5C5C",
      fontSize: 13,
      fontWeight: "bold",
      marginTop: 7,
    },


    testButton: {
      backgroundColor: GOLD,
      padding: 16,
      borderRadius: 10,
      alignItems: "center",
      marginBottom: 12,
    },


    testButtonText: {
      color: "#000000",
      fontWeight: "bold",
    },


    sectionTitle: {
      color: GOLD,
      fontSize: 16,
      fontWeight: "bold",
      marginTop: 20,
      marginBottom: 10,
    },


    heading: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "bold",
      marginTop: 14,
    },


    paragraph: {
      color: "#AAAAAA",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 6,
    },


    premiumHero: {
      alignItems: "center",
      marginTop: 15,
      marginBottom: 20,
    },


    star: {
      color: GOLD,
      fontSize: 45,
    },


    premiumTitle: {
      color: "#FFFFFF",
      fontWeight: "bold",
      fontSize: 18,
      marginTop: 5,
    },


    premiumSub: {
      color: GOLD,
      fontWeight: "bold",
      marginTop: 6,
    },


    trialCard: {
      backgroundColor: "#1A1A1A",
      padding: 22,
      borderRadius: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: GOLD,
    },


    goldSmall: {
      color: GOLD,
      fontWeight: "bold",
    },


    trialDays: {
      color: "#FFFFFF",
      fontSize: 42,
      fontWeight: "bold",
      marginTop: 5,
    },


    freeText: {
      color: GOLD,
      fontSize: 21,
      fontWeight: "bold",
    },


    grayCenter: {
      color: "#AAAAAA",
      textAlign: "center",
      lineHeight: 20,
      marginTop: 12,
    },


    darkBox: {
      backgroundColor: "#171717",
      padding: 15,
      borderRadius: 10,
    },


    benefit: {
      color: "#FFFFFF",
      marginVertical: 6,
      fontSize: 14,
    },


    priceCard: {
      backgroundColor: "#1A1A1A",
      padding: 20,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 20,
    },


    price: {
      color: "#FFFFFF",
      fontSize: 42,
      fontWeight: "bold",
    },


    perMonth: {
      color: "#999999",
      fontSize: 12,
    },


    goldButton: {
      backgroundColor: GOLD,
      padding: 16,
      borderRadius: 10,
      alignItems: "center",
      marginTop: 20,
    },


    goldButtonText: {
      color: "#000000",
      fontWeight: "bold",
    },


    aboutTitle: {
      color: "#FFFFFF",
      fontSize: 19,
      fontWeight: "bold",
      textAlign: "center",
      marginTop: 25,
    },


    rating: {
      color: GOLD,
      fontSize: 30,
      textAlign: "center",
      marginTop: 20,
    },


    contactCard: {
      backgroundColor: "#171717",
      padding: 17,
      borderRadius: 10,
      marginTop: 12,
    },


    contactLabel: {
      color: GOLD,
      fontSize: 12,
      fontWeight: "bold",
      marginBottom: 7,
    },


    contactValue: {
      color: "#FFFFFF",
      fontSize: 15,
      lineHeight: 23,
    },


  });
