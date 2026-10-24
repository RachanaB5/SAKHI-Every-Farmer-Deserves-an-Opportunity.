"use client";

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "./client";

export const signInWithGoogle = (): Promise<UserCredential> =>
  signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());

export const signInWithEmail = (email: string, password: string): Promise<UserCredential> =>
  signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);

export const createEmailAccount = (email: string, password: string): Promise<UserCredential> =>
  createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);

export async function sendEmailSignInLink(email: string): Promise<void> {
  const normalizedEmail = email.trim();
  await sendSignInLinkToEmail(getFirebaseAuth(), normalizedEmail, {
    url: `${window.location.origin}/login`,
    handleCodeInApp: true,
  });
  window.localStorage.setItem("firebaseSignInEmail", normalizedEmail);
}

export async function completeEmailLinkSignIn(url: string, email?: string): Promise<UserCredential | null> {
  const auth = getFirebaseAuth();
  if (!isSignInWithEmailLink(auth, url)) return null;
  const savedEmail = email?.trim() || window.localStorage.getItem("firebaseSignInEmail");
  if (!savedEmail) throw new Error("Enter the email address where the sign-in link was sent.");

  const credential = await signInWithEmailLink(auth, savedEmail, url);
  window.localStorage.removeItem("firebaseSignInEmail");
  return credential;
}
