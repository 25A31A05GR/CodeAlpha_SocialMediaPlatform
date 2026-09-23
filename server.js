const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = 3000;

// -------------------- Middleware --------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "social-media-secret-key",
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static(path.join(__dirname, "public")));

// -------------------- Database --------------------

const db = new sqlite3.Database("./social_media.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id),
      FOREIGN KEY (following_id) REFERENCES users(id)
    )
  `);
});

// -------------------- Authentication --------------------

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Please login first."
    });
  }

  next();
}

// Register
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "Username and password are required."
    });
  }

  if (password.length < 4) {
    return res.status(400).json({
      message: "Password must contain at least 4 characters."
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO users (username, password) VALUES (?, ?)`,
      [username, hashedPassword],
      function (err) {
        if (err) {
          return res.status(400).json({
            message: "Username already exists."
          });
        }

        res.json({
          message: "Registration successful!",
          userId: this.lastID
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      message: "Registration failed."
    });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(401).json({
          message: "Invalid username or password."
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({
          message: "Invalid username or password."
        });
      }

      req.session.userId = user.id;
      req.session.username = user.username;

      res.json({
        message: "Login successful!",
        user: {
          id: user.id,
          username: user.username,
          bio: user.bio
        }
      });
    }
  );
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      message: "Logged out successfully."
    });
  });
});

// Current user
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      loggedIn: false
    });
  }

  db.get(
    `SELECT id, username, bio FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err || !user) {
        return res.json({
          loggedIn: false
        });
      }

      res.json({
        loggedIn: true,
        user
      });
    }
  );
});

// -------------------- Posts --------------------

// Create post
app.post("/api/posts", requireLogin, (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      message: "Post cannot be empty."
    });
  }

  db.run(
    `INSERT INTO posts (user_id, content) VALUES (?, ?)`,
    [req.session.userId, content.trim()],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: "Could not create post."
        });
      }

      res.json({
        message: "Post created successfully!",
        postId: this.lastID
      });
    }
  );
});

// Get all posts
app.get("/api/posts", (req, res) => {
  const currentUserId = req.session.userId || 0;

  const query = `
    SELECT
      posts.id,
      posts.content,
      posts.created_at,
      users.id AS user_id,
      users.username,
      (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) AS like_count,
      EXISTS(
        SELECT 1 FROM likes
        WHERE likes.post_id = posts.id
        AND likes.user_id = ?
      ) AS liked
    FROM posts
    JOIN users ON users.id = posts.user_id
    ORDER BY posts.created_at DESC
  `;

  db.all(query, [currentUserId], (err, posts) => {
    if (err) {
      return res.status(500).json({
        message: "Could not load posts."
      });
    }

    res.json(posts);
  });
});

// Delete own post
app.delete("/api/posts/:id", requireLogin, (req, res) => {
  db.run(
    `DELETE FROM posts WHERE id = ? AND user_id = ?`,
    [req.params.id, req.session.userId],
    function (err) {
      if (err || this.changes === 0) {
        return res.status(400).json({
          message: "Post not found or you are not allowed to delete it."
        });
      }

      res.json({
        message: "Post deleted."
      });
    }
  );
});

// -------------------- Likes --------------------

// Like / Unlike
app.post("/api/posts/:id/like", requireLogin, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;

  db.get(
    `SELECT id FROM likes WHERE post_id = ? AND user_id = ?`,
    [postId, userId],
    (err, like) => {
      if (like) {
        db.run(
          `DELETE FROM likes WHERE post_id = ? AND user_id = ?`,
          [postId, userId],
          () => {
            res.json({
              liked: false,
              message: "Post unliked."
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO likes (post_id, user_id) VALUES (?, ?)`,
          [postId, userId],
          () => {
            res.json({
              liked: true,
              message: "Post liked."
            });
          }
        );
      }
    }
  );
});

// -------------------- Comments --------------------

// Add comment
app.post("/api/posts/:id/comments", requireLogin, (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({
      message: "Comment cannot be empty."
    });
  }

  db.run(
    `INSERT INTO comments (post_id, user_id, content)
     VALUES (?, ?, ?)`,
    [req.params.id, req.session.userId, content.trim()],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: "Could not add comment."
        });
      }

      res.json({
        message: "Comment added!",
        commentId: this.lastID
      });
    }
  );
});

// Get comments
app.get("/api/posts/:id/comments", (req, res) => {
  const query = `
    SELECT
      comments.id,
      comments.content,
      comments.created_at,
      users.username
    FROM comments
    JOIN users ON users.id = comments.user_id
    WHERE comments.post_id = ?
    ORDER BY comments.created_at ASC
  `;

  db.all(query, [req.params.id], (err, comments) => {
    if (err) {
      return res.status(500).json({
        message: "Could not load comments."
      });
    }

    res.json(comments);
  });
});

// -------------------- Follow System --------------------

// Follow / Unfollow
app.post("/api/users/:id/follow", requireLogin, (req, res) => {
  const followingId = Number(req.params.id);
  const followerId = req.session.userId;

  if (followingId === followerId) {
    return res.status(400).json({
      message: "You cannot follow yourself."
    });
  }

  db.get(
    `SELECT id FROM follows
     WHERE follower_id = ? AND following_id = ?`,
    [followerId, followingId],
    (err, follow) => {
      if (follow) {
        db.run(
          `DELETE FROM follows
           WHERE follower_id = ? AND following_id = ?`,
          [followerId, followingId],
          () => {
            res.json({
              following: false,
              message: "Unfollowed successfully."
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO follows (follower_id, following_id)
           VALUES (?, ?)`,
          [followerId, followingId],
          () => {
            res.json({
              following: true,
              message: "Followed successfully."
            });
          }
        );
      }
    }
  );
});

// -------------------- User Profiles --------------------

// Get all users
app.get("/api/users", requireLogin, (req, res) => {
  const query = `
    SELECT
      users.id,
      users.username,
      users.bio,
      EXISTS(
        SELECT 1 FROM follows
        WHERE follows.follower_id = ?
        AND follows.following_id = users.id
      ) AS following
    FROM users
    WHERE users.id != ?
    ORDER BY users.username
  `;

  db.all(
    query,
    [req.session.userId, req.session.userId],
    (err, users) => {
      if (err) {
        return res.status(500).json({
          message: "Could not load users."
        });
      }

      res.json(users);
    }
  );
});

// Update own profile
app.put("/api/profile", requireLogin, (req, res) => {
  const { bio } = req.body;

  db.run(
    `UPDATE users SET bio = ? WHERE id = ?`,
    [bio || "", req.session.userId],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: "Could not update profile."
        });
      }

      res.json({
        message: "Profile updated successfully!"
      });
    }
  );
});

// -------------------- Start Server --------------------

app.listen(PORT, () => {
  console.log(`Social Media App running at http://localhost:${PORT}`);
});