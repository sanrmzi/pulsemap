from flask import Flask, render_template, jsonify, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = "davinci" 
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///pulsemap.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)


class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(128), nullable=False)
    description = db.Column(db.String(256))
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("category.id"), nullable=False)
    country_code = db.Column(db.String(2), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.relationship("Category", backref=db.backref("events", lazy=True))

@app.route("/")
def index():
    cats = Category.query.all()
    categories = [c.name for c in cats]
    # Get the latest 10 events, newest first
    events = Event.query.order_by(Event.created_at.desc()).limit(10).all()
    return render_template("index.html", categories=categories, events=events)

SUPER_PASSWORD = "davinci"

@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        password = request.form.get("password")
        if password == SUPER_PASSWORD:
            session["admin_logged_in"] = True
            return redirect(url_for("admin_dashboard"))
        else:
            flash("Incorrect password.")
    return render_template("admin_login.html")

@app.route("/admin/logout")
def admin_logout():
    session.pop("admin_logged_in", None)
    flash("Logged out.")
    return redirect(url_for("admin_login"))

def admin_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return redirect(url_for("admin_login"))
        return f(*args, **kwargs)
    return decorated_function

@app.route("/admin", methods=["GET", "POST"])
@admin_required
def admin_dashboard():
    categories = Category.query.all()
    events = Event.query.all()

    if request.method == "POST":
        # Add new event
        title = request.form.get("title")
        description = request.form.get("description")
        latitude = request.form.get("latitude")
        longitude = request.form.get("longitude")
        category_id = request.form.get("category_id")
        country_code = request.form.get("country_code")
        if title and latitude and longitude and category_id and country_code:
            event = Event(
                title=title,
                description=description,
                latitude=float(latitude),
                longitude=float(longitude),
                category_id=int(category_id),
                country_code=country_code,
            )
            db.session.add(event)
            db.session.commit()
            flash("Event added!")
            return redirect(url_for("admin_dashboard"))
        else:
            flash("Missing required fields.")

    # Prepare data for chart: events per day for last 30 days
    today = datetime.utcnow().date()
    last_30_days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    event_counts = {d: 0 for d in last_30_days}
    for event in events:
        event_date = event.created_at.date()
        if event_date in event_counts:
            event_counts[event_date] += 1
    chart_labels = [d.strftime("%Y-%m-%d") for d in last_30_days]
    chart_values = [event_counts[d] for d in last_30_days]

    return render_template(
        "admin.html",
        categories=categories,
        events=events,
        chart_labels=chart_labels,
        chart_values=chart_values,
    )


@app.route("/admin/delete/<int:event_id>", methods=["POST"])
@admin_required
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    flash("Event deleted!")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/edit/<int:event_id>", methods=["GET", "POST"])
@admin_required
def edit_event(event_id):
    event = Event.query.get_or_404(event_id)
    categories = Category.query.all()
    if request.method == "POST":
        event.title = request.form.get("title")
        event.description = request.form.get("description")
        event.latitude = float(request.form.get("latitude"))
        event.longitude = float(request.form.get("longitude"))
        event.category_id = int(request.form.get("category_id"))
        event.country_code = request.form.get("country_code")
        db.session.commit()
        flash("Event updated!")
        return redirect(url_for("admin_dashboard"))
    return render_template("edit_event.html", event=event, categories=categories)


@app.route('/get_events')
def get_events():
    country_code = request.args.get('country_code')
    query = Event.query
    if country_code:
        query = query.filter_by(country_code=country_code)
    events = query.order_by(Event.created_at.desc()).all()
    return jsonify({
        "events": [
            {
                "title": e.title,
                "description": e.description,
                "lat": e.latitude,
                "lng": e.longitude,
                "category": e.category.name,
                "country_code": e.country_code,
                "created_at": e.created_at.isoformat()
            }
            for e in events
        ]
    })


@app.route('/get_categories')
def get_categories():
    cats = Category.query.all()
    color_map = {
        "Politics": "#4E2E0E",  # dark brown
        "Health": "#e74c3c",
        "Sports": "#2980b9",
        "Technology": "#16a085",
        "Culture": "#8e44ad",
        "Entertainment": "#f39c12",
        "Finance": "#27ae60"
    }
    categories = [
        {
            "name": c.name,
            "color": color_map.get(c.name, "#7f8c8d")
        }
        for c in cats
    ]
    return jsonify(categories=categories)


if __name__ == "__main__":
    app.run(debug=True)
