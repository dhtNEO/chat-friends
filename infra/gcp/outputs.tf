output "public_ip" { value = google_compute_address.public.address }
output "instance" { value = google_compute_instance.friends.name }
output "data_disk" { value = google_compute_disk.data.name }
