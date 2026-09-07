import { Router } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { query } from "../config/postgres.js";
import { signToken } from "../middleware/auth.js";

export const authRouter = Router();

async function upsertUser({ email, displayName, provider, providerId }) {
  const existing = await query("SELECT * FROM users WHERE email = $1", [email]);
  if (existing.rows.length) return existing.rows[0];

  const inserted = await query(
    `INSERT INTO users (email, display_name, auth_provider, provider_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [email, displayName, provider, providerId]
  );
  return inserted.rows[0];
}

// OAuth strategies are only registered when credentials exist, so the app
// still boots cleanly in an environment with no Google/GitHub app configured
// — /auth/google and /auth/github just 404 until keys are added to .env.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await upsertUser({
            email: profile.emails?.[0]?.value,
            displayName: profile.displayName,
            provider: "google",
            providerId: profile.id,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );

  authRouter.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
  authRouter.get(
    "/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/login-failed" }),
    (req, res) => {
      const token = signToken(req.user);
      res.redirect(`${process.env.CLIENT_ORIGIN}/auth/callback?token=${token}`);
    }
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "/auth/github/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await upsertUser({
            email: profile.emails?.[0]?.value ?? `${profile.username}@users.noreply.github.com`,
            displayName: profile.displayName ?? profile.username,
            provider: "github",
            providerId: profile.id,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );

  authRouter.get("/github", passport.authenticate("github", { scope: ["user:email"], session: false }));
  authRouter.get(
    "/github/callback",
    passport.authenticate("github", { session: false, failureRedirect: "/login-failed" }),
    (req, res) => {
      const token = signToken(req.user);
      res.redirect(`${process.env.CLIENT_ORIGIN}/auth/callback?token=${token}`);
    }
  );
}

authRouter.get("/me", async (req, res) => {
  res.json({ configured: { google: !!process.env.GOOGLE_CLIENT_ID, github: !!process.env.GITHUB_CLIENT_ID } });
});
