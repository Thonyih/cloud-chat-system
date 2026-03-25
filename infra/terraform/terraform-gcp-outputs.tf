# Terraform GCP
# To output variables, follow pattern:
# value = TYPE.NAME.ATTR

output "master" {
    value = join(" ", google_compute_instance.master.*.network_interface.0.access_config.0.nat_ip)
}

output "master_ssh" {
 value = google_compute_instance.master.self_link
}

# example for a set of identical instances created with "count"
output "worker_IPs"  {
  value = formatlist("%s = %s", google_compute_instance.worker[*].name, google_compute_instance.worker[*].network_interface.0.access_config.0.nat_ip)
}
