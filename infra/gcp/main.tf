terraform {
  required_version = "~> 1.13.0"
  required_providers {
    google = { source = "hashicorp/google", version = "7.11.0" }
  }
}
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
resource "google_compute_network" "friends" {
  name                    = "${var.name}-network"
  auto_create_subnetworks = false
}
resource "google_compute_subnetwork" "friends" {
  name          = "${var.name}-subnet"
  ip_cidr_range = "10.42.0.0/24"
  network       = google_compute_network.friends.id
}
resource "google_service_account" "vm" {
  account_id   = "${var.name}-vm"
  display_name = "Chat friends VM; sem papéis IAM por padrão"
}
resource "google_compute_address" "public" { name = "${var.name}-ip" }
resource "google_compute_disk" "data" {
  name = "${var.name}-data"
  type = "pd-balanced"
  size = var.data_disk_gb
  lifecycle { prevent_destroy = true }
  labels = var.labels
}
resource "google_compute_firewall" "web_media" {
  name          = "${var.name}-web-media"
  network       = google_compute_network.friends.id
  target_tags   = [var.name]
  source_ranges = var.client_cidrs
  allow {
    protocol = "tcp"
    ports    = ["80", "443", "7881"]
  }
  allow {
    protocol = "udp"
    ports    = ["443", "7882"]
  }
}
resource "google_compute_firewall" "iap_ssh" {
  name          = "${var.name}-iap-ssh"
  network       = google_compute_network.friends.id
  target_tags   = [var.name]
  source_ranges = ["35.235.240.0/20"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
resource "google_compute_instance" "friends" {
  name                      = var.name
  machine_type              = var.machine_type
  tags                      = [var.name]
  labels                    = var.labels
  deletion_protection       = true
  allow_stopping_for_update = true
  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = 20
      type  = "pd-balanced"
    }
  }
  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "friends-data"
  }
  network_interface {
    subnetwork = google_compute_subnetwork.friends.id
    access_config { nat_ip = google_compute_address.public.address }
  }
  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }
  metadata                = { enable-oslogin = "TRUE", block-project-ssh-keys = "TRUE" }
  metadata_startup_script = file("${path.module}/startup.sh")
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}
