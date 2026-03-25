# Ansible automation

This playbook provisions a fresh Ubuntu VM on Google Cloud as a single-node Kubernetes control plane and deploys the application manifests found under `Application/k8s`.

## Prerequisites
- Ansible 2.13+ installed on your workstation (tested with 2.15).
- SSH access to the target VM using the key referenced in `inventory.ini`.
- The repository layout unchanged so that `../k8s` (relative to this folder) contains the application manifests and SQL files.
- The VM must expose outbound HTTPS in order to download Kubernetes components and CNI manifests.

## Usage
1. Update `inventory.ini` with the public IP or hostname of your VM, plus the SSH user/key path.
2. (Optional) Override secrets or adjust other variables by passing `--extra-vars`, e.g.:
   ```bash
   ansible-playbook -i inventory.ini playbook.yml \
     --extra-vars '{"app_secret_data":{"JWT_SECRET":"replace_me","DB_PASSWORD":"my_db_pass"}}'
   ```
3. Run the playbook from this directory:
   ```bash
   cd Application/ansible
   ansible-playbook -i inventory.ini playbook.yml
   ```

The playbook is idempotent; rerunning it keeps the VM aligned with the desired state. It installs containerd, configures Kubernetes components, deploys Calico and the local-path storage class, creates ConfigMaps and Secrets from the SQL assets, and applies every `*.yaml`/`*.yml` manifest copied to `/home/ubuntu/k8s` on the VM.

## After provisioning
- Confirm the node is `Ready` and workloads are running:
  ```bash
  kubectl get nodes
  kubectl get pods -A
  ```
- To update application images later, push new tags to your registry and run `kubectl set image` (or adjust the manifests and rerun the playbook).
