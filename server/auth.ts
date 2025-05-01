import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { insertUserSchema } from "@shared/schema";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";

// Define User interface
declare global {
  namespace Express {
    interface User {
      _id: string;
      username: string;
      name: string;
      email: string;
      password: string;
    }
  }
}

// Create MongoDB User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Create User model
const UserModel = mongoose.model<Express.User & mongoose.Document>("User", userSchema);

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// MongoDB User data access methods
const mongoStorage = {
  async getUserByUsername(username: string) {
    return UserModel.findOne({ username }).lean();
  },
  
  async getUserByEmail(email: string) {
    return UserModel.findOne({ email }).lean();
  },
  
  async getUser(id: string) {
    return UserModel.findById(id).lean();
  },
  
  async createUser(userData: { username: string; password: string; name: string; email: string }) {
    const newUser = new UserModel(userData);
    return newUser.save();
  }
};

const registerSchema = insertUserSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function setupAuth(app: Express) {
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://advaysinhaa:dLwVx1rqDPSSgrtg@algotrade.9mloe.mongodb.net/algotrade';
  mongoose.connect(mongoUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));
  
  const isDev = app.get("env") === "development";
  const sessionSecret = process.env.SESSION_SECRET || "algo-trade-secret-key";

  // Configure session with MongoDB as store
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
      mongoUrl: mongoUri,
      collectionName: 'sessions'
    }),
    cookie: {
      secure: !isDev,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    }
  };

  if (!isDev) {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure LocalStrategy with MongoDB
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await mongoStorage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  // Serialize/deserialize user with MongoDB ObjectId
  passport.serializeUser((user, done) => done(null, user._id));
  
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await mongoStorage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Registration endpoint
  app.post("/api/register", async (req, res, next) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Validation failed", errors: result.error.format() });
      }

      const { username, password, name, email } = result.data;

      // Check if username or email already exists
      const existingUser = await mongoStorage.getUserByUsername(username);
      const existingEmail = await mongoStorage.getUserByEmail(email);

      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const hashedPassword = await hashPassword(password);

      const user = await mongoStorage.createUser({
        username,
        password: hashedPassword,
        name,
        email
      });

      // Remove password from response
      const userObject = user.toObject();
      const { password: _, ...userWithoutPassword } = userObject;

      req.login(userObject, (err) => {
        if (err) return next(err);
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid username or password" });

      req.login(user, (err) => {
        if (err) return next(err);
        
        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  // Logout endpoint
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Get current user endpoint
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Remove password from response
    const { password, ...userWithoutPassword } = req.user;
    
    res.json(userWithoutPassword);
  });
}