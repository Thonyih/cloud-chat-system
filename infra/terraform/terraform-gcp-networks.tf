
# Elements of the cloud such as virtual servers,
# networks, firewall rules are created as resources
# syntax is: resource RESOURCE_TYPE RESOURCE_NAME
# https://www.terraform.io/docs/configuration/resources.html

resource "google_compute_firewall" "cluster_rules" {
  name    = "cluster"
  network = "default"

  allow {
    protocol = "tcp"
    ports = ["80", "443", "30510", 
      "6443", "179", # Kubernetes API and Calico BGP
    ]
  }

  # ref: https://docs.tigera.io/calico/latest/getting-started/kubernetes/requirements
  allow {
    protocol = "ipip" # protocol 4 for calico IP-in-IP encapsulation
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags = ["cluster"]
}
