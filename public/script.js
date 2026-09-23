let currentUser = null;

// -------------------- Page Load --------------------

document.addEventListener("DOMContentLoaded", async () => {
    await checkLogin();
});

// -------------------- Login Check --------------------

async function checkLogin() {
    try {
        const response = await fetch("/api/me");
        const data = await response.json();

        if (!data.loggedIn) {
            window.location.href = "login.html";
            return;
        }

        currentUser = data.user;

        document.getElementById("userInfo").innerHTML =
            `<strong>Hi, ${escapeHtml(currentUser.username)} 👋</strong>`;

        document.getElementById("profileUsername").value =
            currentUser.username;

        document.getElementById("profileBio").value =
            currentUser.bio || "";

        await loadPosts();
        await loadUsers();

    } catch (error) {
        console.error("Login check error:", error);
    }
}

// -------------------- Create Post --------------------

async function createPost() {
    const contentInput = document.getElementById("postContent");
    const message = document.getElementById("postMessage");

    const content = contentInput.value.trim();

    if (!content) {
        message.textContent = "Please write something first.";
        return;
    }

    try {
        const response = await fetch("/api/posts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content })
        });

        const data = await response.json();

        message.textContent = data.message;

        if (response.ok) {
            contentInput.value = "";
            await loadPosts();
        }

    } catch (error) {
        message.textContent = "Could not create post.";
    }
}

// -------------------- Load Posts --------------------

async function loadPosts() {
    const container = document.getElementById("postsContainer");

    try {
        const response = await fetch("/api/posts");
        const posts = await response.json();

        if (posts.length === 0) {
            container.innerHTML =
                `<div class="card">No posts yet. Create the first post! 📝</div>`;
            return;
        }

        container.innerHTML = posts.map(post => `
            <article class="post-card">

                <div class="post-header">
                    <span class="username">
                        👤 ${escapeHtml(post.username)}
                    </span>

                    <span class="post-date">
                        ${formatDate(post.created_at)}
                    </span>
                </div>

                <div class="post-content">
                    ${escapeHtml(post.content)}
                </div>

                <div class="post-actions">

                    <button
                        class="like-btn"
                        onclick="toggleLike(${post.id})"
                    >
                        ${post.liked ? "❤️ Liked" : "🤍 Like"}
                        (${post.like_count})
                    </button>

                    ${
                        currentUser &&
                        Number(currentUser.id) === Number(post.user_id)
                        ? `
                        <button
                            class="delete-btn"
                            onclick="deletePost(${post.id})"
                        >
                            🗑️ Delete
                        </button>
                        `
                        : ""
                    }

                </div>

                <div class="comment-box">
                    <input
                        type="text"
                        id="comment-${post.id}"
                        placeholder="Write a comment..."
                        maxlength="200"
                    >

                    <button
                        class="comment-btn"
                        onclick="addComment(${post.id})"
                    >
                        Comment
                    </button>
                </div>

                <div
                    class="comments"
                    id="comments-${post.id}"
                >
                    Loading comments...
                </div>

            </article>
        `).join("");

        for (const post of posts) {
            await loadComments(post.id);
        }

    } catch (error) {
        container.innerHTML =
            `<div class="card">Could not load posts.</div>`;
    }
}

// -------------------- Like / Unlike --------------------

async function toggleLike(postId) {
    try {
        await fetch(`/api/posts/${postId}/like`, {
            method: "POST"
        });

        await loadPosts();

    } catch (error) {
        console.error("Like error:", error);
    }
}

// -------------------- Delete Post --------------------

async function deletePost(postId) {
    const confirmed = confirm("Delete this post?");

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: "DELETE"
        });

        const data = await response.json();

        alert(data.message);

        if (response.ok) {
            await loadPosts();
        }

    } catch (error) {
        alert("Could not delete post.");
    }
}

// -------------------- Add Comment --------------------

async function addComment(postId) {
    const input = document.getElementById(`comment-${postId}`);

    const content = input.value.trim();

    if (!content) {
        alert("Please write a comment.");
        return;
    }

    try {
        const response = await fetch(
            `/api/posts/${postId}/comments`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ content })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(data.message);
            return;
        }

        input.value = "";

        await loadComments(postId);

    } catch (error) {
        alert("Could not add comment.");
    }
}

// -------------------- Load Comments --------------------

async function loadComments(postId) {
    const container =
        document.getElementById(`comments-${postId}`);

    if (!container) {
        return;
    }

    try {
        const response =
            await fetch(`/api/posts/${postId}/comments`);

        const comments = await response.json();

        if (comments.length === 0) {
            container.innerHTML =
                `<p>No comments yet.</p>`;
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <strong>
                    ${escapeHtml(comment.username)}
                </strong>

                <p>
                    ${escapeHtml(comment.content)}
                </p>
            </div>
        `).join("");

    } catch (error) {
        container.innerHTML =
            `<p>Could not load comments.</p>`;
    }
}

// -------------------- Load Users --------------------

async function loadUsers() {
    const container =
        document.getElementById("usersContainer");

    try {
        const response = await fetch("/api/users");

        if (!response.ok) {
            return;
        }

        const users = await response.json();

        if (users.length === 0) {
            container.innerHTML =
                `<p>No other users available yet.</p>`;
            return;
        }

        container.innerHTML = users.map(user => `
            <div class="user-card">

                <div class="user-info">
                    <h3>
                        👤 ${escapeHtml(user.username)}
                    </h3>

                    <p>
                        ${escapeHtml(
                            user.bio || "No bio available."
                        )}
                    </p>
                </div>

                <button
                    class="follow-btn ${
                        user.following ? "following" : ""
                    }"
                    onclick="toggleFollow(${user.id})"
                >
                    ${
                        user.following
                        ? "Following ✓"
                        : "Follow +"
                    }
                </button>

            </div>
        `).join("");

    } catch (error) {
        container.innerHTML =
            `<p>Could not load users.</p>`;
    }
}

// -------------------- Follow / Unfollow --------------------

async function toggleFollow(userId) {
    try {
        const response =
            await fetch(`/api/users/${userId}/follow`, {
                method: "POST"
            });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message);
            return;
        }

        await loadUsers();

    } catch (error) {
        alert("Could not update follow status.");
    }
}

// -------------------- Update Profile --------------------

async function updateProfile() {
    const bio =
        document.getElementById("profileBio").value.trim();

    const message =
        document.getElementById("profileMessage");

    try {
        const response = await fetch("/api/profile", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ bio })
        });

        const data = await response.json();

        message.textContent = data.message;

        if (response.ok) {
            currentUser.bio = bio;
        }

    } catch (error) {
        message.textContent =
            "Could not update profile.";
    }
}

// -------------------- Logout --------------------

async function logout() {
    try {
        await fetch("/api/logout", {
            method: "POST"
        });

        window.location.href = "login.html";

    } catch (error) {
        alert("Logout failed.");
    }
}

// -------------------- Helper Functions --------------------

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) {
        return "";
    }

    const date = new Date(dateString.replace(" ", "T") + "Z");

    return date.toLocaleString();
}