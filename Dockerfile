# Use the official Ubuntu base image.
FROM ubuntu:latest

# Prevent interactive prompts during package installation.
ENV DEBIAN_FRONTEND=noninteractive

# ENV ANSIBLE_CONFIG=/root/ansible/ansible.cfg

# Update package lists.
RUN apt-get update

# Install facilities.
RUN apt-get install -y supervisor openssh-server iputils-ping unzip

# Install additional facilities.
RUN apt-get -y install libssl-dev libffi-dev gnupg python3-dev python3-pip snapd

# Install ansible.
RUN apt install -y software-properties-common && \
    apt-add-repository -y -u ppa:ansible/ansible && \
    apt-get update && \
    apt-get install -y ansible

# Install terraform.
RUN wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null
RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
RUN apt-get update && \
    apt-get install -y terraform

# Add graph builder tool for Terraform.
RUN apt-get -y install graphviz

# Install Google Cloud SDK.
#RUN apt-get -y install apt-transport-https
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
RUN wget -O- https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
RUN apt-get update && \
    apt-get -y install google-cloud-sdk

# Install Kubernetes Controller.
RUN apt-get -y install kubectl google-cloud-sdk-gke-gcloud-auth-plugin

# Create directories for supervisor and sshd
RUN mkdir -p /var/run/sshd /var/log/supervisor

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Clean cache packages
RUN apt-get clean all && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /root

# Supervisor is out "init". Launches ssh and waits forever.
CMD ["/usr/bin/supervisord"]
